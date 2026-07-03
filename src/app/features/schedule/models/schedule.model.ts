export interface TimelineMonth {
  year:  number;
  month: number;
  label: string;
}

export interface ScheduleRow {
  id:            string;
  name:          string;
  status:        string;
  start_date:    string;
  end_date:      string;
  percent_done:  number;
  offsetPercent: number;
  widthPercent:  number;
}
