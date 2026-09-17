// Versión Go de scripts/vps/deploy-vps.sh. Mismo flujo, misma lógica, sin
// reescribir el comportamiento: deploy del frontend Angular (build
// "application", sin SSR) al VPS de FODC (fodcpmo.cloud). Multiplataforma
// (macOS/Linux/Windows) — depende de ssh/scp/rsync/curl/npm en el PATH,
// igual que scripts/vps/deploy-go del backend hermano.
//
// Antes de sincronizar, respalda el contenido actual del VPS a
// REMOTE_WEB_DIR.bak-<timestamp> (en el propio servidor) y además baja copia
// local a backups/<timestamp>/web_backup.tar.gz. Rollback con
// scripts/vps/rollback-vps.sh <timestamp>.
//
// Uso:
//
//	go run .                    # build + deploy con confirmación
//	go run . --yes              # sin confirmación interactiva
//	go run . --dry-run          # build real, pero rsync en modo simulación
//	go run . --skip-build       # usa el dist/ que ya esté en disco
//	go run . --no-local-backup  # no baja tar.gz local (solo respaldo remoto)
//
// Requiere scripts/vps/deploy.env (gitignored, ver deploy.env.example) con
// REMOTE_USER/REMOTE_HOST/SSH_KEY/REMOTE_WEB_DIR.
package main

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

type config struct {
	remoteUser    string
	remoteHost    string
	remotePort    string
	remoteWebDir  string
	sshKey        string
	autoYes       bool
	dryRun        bool
	skipBuild     bool
	localBackup   bool
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "❌", err)
		os.Exit(1)
	}
}

func run() error {
	rootDir, err := findRootDir()
	if err != nil {
		return err
	}
	scriptDir := filepath.Join(rootDir, "scripts", "vps")

	cfg, err := loadConfig(scriptDir)
	if err != nil {
		return err
	}
	if err := parseArgs(&cfg, os.Args[1:]); err != nil {
		return err
	}

	// REMOTE_WEB_DIR se usa con `rsync --delete` y `rm -rf` para el respaldo
	// viejo — un valor vacío, "/" o demasiado corto sería catastrófico.
	if !strings.HasPrefix(cfg.remoteWebDir, "/") || !strings.Contains(cfg.remoteWebDir, "fodc") {
		return fmt.Errorf("REMOTE_WEB_DIR ('%s') no parece una ruta segura (se espera algo como /var/www/fodc). Abortando", cfg.remoteWebDir)
	}

	ssh := &sshClient{cfg: cfg}
	closeMaster, err := ssh.startMaster()
	if err != nil {
		return err
	}
	defer closeMaster()

	buildDir := filepath.Join(rootDir, "dist", "project-pmo", "browser")

	fmt.Printf("==> Verificando conexión SSH a %s\n", ssh.target())
	if err := ssh.runLocalCheck(); err != nil {
		return fmt.Errorf("no se pudo conectar por SSH: %w", err)
	}

	indexHTML := filepath.Join(buildDir, "index.html")
	if cfg.skipBuild {
		fmt.Println("==> --skip-build: usando el dist/ que ya está en disco")
		if _, err := os.Stat(indexHTML); err != nil {
			return fmt.Errorf("no hay build en %s (falta index.html). Corre sin --skip-build", buildDir)
		}
	} else {
		fmt.Println("==> Instalando dependencias (si hace falta)")
		if _, err := os.Stat(filepath.Join(rootDir, "node_modules")); err != nil {
			if err := runIn(rootDir, "npm", "install"); err != nil {
				return err
			}
		}

		fmt.Println("==> Compilando build de producción (ng build --configuration production)")
		if err := runIn(rootDir, "npm", "run", "build", "--", "--configuration", "production"); err != nil {
			return err
		}

		if _, err := os.Stat(indexHTML); err != nil {
			return fmt.Errorf("el build no generó %s — algo falló", indexHTML)
		}
	}

	buildSize := duHuman(buildDir)
	fileCount := countFiles(buildDir)
	fmt.Printf("==> Build listo: %s (%s, %d archivos)\n", buildDir, buildSize, fileCount)

	ts := time.Now().Format("20060102-150405")
	backupDir := cfg.remoteWebDir + ".bak-" + ts

	rsyncSSH := "ssh -p " + cfg.remotePort
	if cfg.sshKey != "" {
		rsyncSSH += " -i " + cfg.sshKey
	}

	if cfg.dryRun {
		fmt.Println()
		fmt.Println("==> DRY RUN: no se va a tocar el servidor. Vista previa de cambios:")
		if err := runStream("rsync", "-rlvzn", "--delete", "-e", rsyncSSH, buildDir+"/", ssh.target()+":"+cfg.remoteWebDir+"/"); err != nil {
			return err
		}
		fmt.Println()
		fmt.Println("(dry-run) fin — nada se modificó en el servidor.")
		return nil
	}

	fmt.Println()
	fmt.Printf("==> Se va a desplegar a %s:%s\n", ssh.target(), cfg.remoteWebDir)
	fmt.Printf("    Respaldo previo en: %s\n", backupDir)
	fmt.Println("    (nginx y el resto de sitios del server quedan intactos)")
	if !cfg.autoYes {
		if !confirm("Continuar? [y/N] ") {
			return fmt.Errorf("cancelado")
		}
	}

	fmt.Printf("==> Respaldando contenido actual en el servidor (%s)\n", backupDir)
	// cp -al (hardlinks) en vez de cp -a: mismo filesystem remoto, así que el
	// respaldo es instantáneo (solo entradas de directorio, cero I/O de
	// contenido real) en vez de duplicar cada archivo byte a byte.
	if err := ssh.runStream(fmt.Sprintf(
		"test -d '%s' && cp -al '%s' '%s' || mkdir -p '%s'",
		cfg.remoteWebDir, cfg.remoteWebDir, backupDir, cfg.remoteWebDir,
	)); err != nil {
		return err
	}

	if cfg.localBackup {
		fmt.Println("==> Bajando copia local de ese backup (por si se pierde acceso al VPS o se borra el remoto)")
		localBackupDir := filepath.Join(rootDir, "backups", ts)
		if err := os.MkdirAll(localBackupDir, 0o755); err != nil {
			return err
		}
		localTar := filepath.Join(localBackupDir, "web_backup.tar.gz")
		if err := ssh.downloadTar(backupDir, localTar); err != nil {
			return err
		}
		fmt.Println("   ", duHumanFile(localTar))
	} else {
		fmt.Printf("==> --no-local-backup: se omite la copia local (queda el respaldo remoto %s)\n", backupDir)
	}

	fmt.Println("==> Purgando backups remotos viejos (se conservan los últimos 10)")
	ssh.runQuiet(fmt.Sprintf(
		"cd '%s' && ls -1dt '%s'.bak-* 2>/dev/null | tail -n +11 | xargs -r rm -rf --",
		filepath.Dir(cfg.remoteWebDir), filepath.Base(cfg.remoteWebDir),
	))

	fmt.Printf("==> Sincronizando build (rsync --delete, solo dentro de %s)\n", cfg.remoteWebDir)
	// -rlvz en vez de -avz (sin -p/-t/-o/-g): si los directorios remotos
	// quedaron con dueño distinto al usuario de deploy (deploys previos con
	// sudo, etc), no se puede tocar owner/permisos/mtime del directorio en sí
	// (rsync devuelve exit 23 aunque los archivos sí se copien bien). Los
	// permisos de archivo quedan explícitos en el chmod de abajo.
	if err := runStream("rsync", "-rlvz", "--delete", "-e", rsyncSSH, buildDir+"/", ssh.target()+":"+cfg.remoteWebDir+"/"); err != nil {
		return err
	}

	fmt.Println("==> Asegurando permisos de lectura para nginx")
	ssh.runQuiet(fmt.Sprintf("chmod -R u=rwX,go=rX '%s'", cfg.remoteWebDir))

	fmt.Println()
	fmt.Println("==> Verificando que el sitio responde")
	httpCode := httpStatus("https://fodcpmo.cloud/")
	if httpCode == "200" {
		fmt.Println("✅ https://fodcpmo.cloud/ respondió 200")
	} else {
		fmt.Printf("⚠️  https://fodcpmo.cloud/ respondió '%s' (revisa manualmente antes de dar por bueno el deploy)\n", httpCode)
	}

	fmt.Println()
	fmt.Println("✅ Deploy OK.")
	fmt.Printf("   Rollback si algo sale mal: scripts/vps/rollback-vps.sh %s\n", ts)
	return nil
}

func findRootDir() (string, error) {
	wd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	// scripts/vps/deploy-go -> root
	root := filepath.Clean(filepath.Join(wd, "..", "..", ".."))
	if _, err := os.Stat(filepath.Join(root, "scripts")); err != nil {
		return "", fmt.Errorf("corré este comando desde scripts/vps/deploy-go (no se encontró la raíz del repo): %w", err)
	}
	return root, nil
}

func loadConfig(scriptDir string) (config, error) {
	cfg := config{
		remotePort:  "22",
		localBackup: true,
	}
	envPath := filepath.Join(scriptDir, "deploy.env")
	f, err := os.Open(envPath)
	if err != nil {
		return cfg, fmt.Errorf("falta %s — copia deploy.env.example y ajusta", envPath)
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.Trim(strings.TrimSpace(parts[1]), `"'`)
		switch key {
		case "REMOTE_USER":
			cfg.remoteUser = val
		case "REMOTE_HOST":
			cfg.remoteHost = val
		case "REMOTE_PORT":
			cfg.remotePort = val
		case "SSH_KEY":
			cfg.sshKey = expandHome(val)
		case "REMOTE_WEB_DIR":
			cfg.remoteWebDir = val
		}
	}

	if cfg.remoteUser == "" {
		return cfg, fmt.Errorf("set REMOTE_USER en %s", envPath)
	}
	if cfg.remoteHost == "" {
		return cfg, fmt.Errorf("set REMOTE_HOST en %s", envPath)
	}
	if cfg.remoteWebDir == "" {
		return cfg, fmt.Errorf("set REMOTE_WEB_DIR en %s", envPath)
	}
	return cfg, nil
}

func parseArgs(cfg *config, args []string) error {
	cfg.autoYes = false
	for _, arg := range args {
		switch arg {
		case "--yes", "-y":
			cfg.autoYes = true
		case "--dry-run":
			cfg.dryRun = true
		case "--skip-build":
			cfg.skipBuild = true
		case "--no-local-backup":
			cfg.localBackup = false
		default:
			return fmt.Errorf("argumento desconocido: %s", arg)
		}
	}
	return nil
}

func expandHome(p string) string {
	if strings.HasPrefix(p, "~/") {
		if home, err := os.UserHomeDir(); err == nil {
			return filepath.Join(home, p[2:])
		}
	}
	return p
}

func confirm(prompt string) bool {
	fmt.Print(prompt)
	reader := bufio.NewReader(os.Stdin)
	line, _ := reader.ReadString('\n')
	line = strings.TrimSpace(line)
	return line == "y" || line == "Y"
}

type sshClient struct {
	cfg        config
	controlDir string
}

func (s *sshClient) target() string {
	return s.cfg.remoteUser + "@" + s.cfg.remoteHost
}

// startMaster abre la conexión ControlMaster reusada por el resto del
// deploy: sin esto cada llamada ssh/scp/rsync abre su propia conexión TCP +
// handshake desde cero. En Windows no hay sockets de dominio Unix confiables
// para ControlPath, así que ahí seguimos sin multiplexar (cada comando abre
// su propia conexión) — el resto del flujo funciona igual.
func (s *sshClient) startMaster() (func(), error) {
	noop := func() {}
	if strings.HasPrefix(strings.ToLower(runtime.GOOS), "windows") {
		return noop, nil
	}
	dir, err := os.MkdirTemp("", "pmo-web-deploy-ssh-")
	if err != nil {
		return nil, err
	}
	s.controlDir = dir
	return func() {
		args := append(append([]string{}, s.baseArgs()...), "-O", "exit", s.target())
		exec.Command("ssh", args...).Run()
		os.RemoveAll(dir)
	}, nil
}

func (s *sshClient) controlPath() string {
	if s.controlDir == "" {
		return ""
	}
	return filepath.Join(s.controlDir, "cm.sock")
}

func (s *sshClient) baseArgs() []string {
	a := []string{"-p", s.cfg.remotePort}
	if s.cfg.sshKey != "" {
		a = append(a, "-i", s.cfg.sshKey)
	}
	if cp := s.controlPath(); cp != "" {
		a = append(a, "-o", "ControlMaster=auto", "-o", "ControlPersist=120", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3", "-o", "ControlPath="+cp)
	}
	return a
}

// runLocalCheck valida la conexión SSH (BatchMode + timeout corto), igual
// que el `ssh ... true` del bash original.
func (s *sshClient) runLocalCheck() error {
	args := append(append([]string{}, s.baseArgs()...), "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", s.target(), "true")
	cmd := exec.Command("ssh", args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// runStream ejecuta un comando remoto mostrando stdout/stderr en vivo.
func (s *sshClient) runStream(remoteCmd string) error {
	args := append(append([]string{}, s.baseArgs()...), s.target(), remoteCmd)
	cmd := exec.Command("ssh", args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// runQuiet corre un comando remoto ignorando el código de salida, como los
// `|| true` del bash original.
func (s *sshClient) runQuiet(remoteCmd string) {
	args := append(append([]string{}, s.baseArgs()...), s.target(), remoteCmd)
	exec.Command("ssh", args...).Run()
}

// downloadTar hace `tar czf -` remoto del directorio de backup y lo escribe
// como archivo local, igual que el pipe `ssh ... tar czf - | > archivo.tar.gz`
// del bash.
func (s *sshClient) downloadTar(remoteDir, localPath string) error {
	out, err := os.Create(localPath)
	if err != nil {
		return err
	}
	defer out.Close()

	remoteCmd := fmt.Sprintf("tar czf - -C '%s' '%s'", filepath.Dir(remoteDir), filepath.Base(remoteDir))
	args := append(append([]string{}, s.baseArgs()...), s.target(), remoteCmd)
	cmd := exec.Command("ssh", args...)
	cmd.Stdout = out
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func runIn(dir string, name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.Dir = dir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	return cmd.Run()
}

func runStream(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func duHuman(dir string) string {
	out, err := exec.Command("du", "-sh", dir).Output()
	if err != nil {
		return "?"
	}
	fields := strings.Fields(string(out))
	if len(fields) == 0 {
		return "?"
	}
	return fields[0]
}

func duHumanFile(path string) string {
	info, err := os.Stat(path)
	if err != nil {
		return ""
	}
	return fmt.Sprintf("%.1fM", float64(info.Size())/1024/1024)
}

func countFiles(dir string) int {
	count := 0
	filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() {
			count++
		}
		return nil
	})
	return count
}

func httpStatus(url string) string {
	out, err := exec.Command("curl", "-s", "-o", os.DevNull, "-w", "%{http_code}", "--max-time", "10", url).Output()
	if err != nil {
		return "curl_failed"
	}
	return strings.TrimSpace(string(out))
}
