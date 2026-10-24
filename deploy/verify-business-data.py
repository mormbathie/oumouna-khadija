#!/usr/bin/env python3
"""Read-only hashes before/after an additive release. No business values printed."""
import json,os,subprocess,sys
from pathlib import Path
TABLES=['Student','Parent','Invoice','Payment','Enrollment','Classroom','AcademicYear','Subject','Grade','ReportCard','Attendance','StudentDocument','ParentDocument','User','StaffAttendance','StaffQrCard','SchoolHoliday','SchoolCalendarSettings']
NEW_COLUMNS=['duplicateOverrideReason','cancelledAt','cancellationReason','cancelledById','cancelledByName','cancelledByRole']
def snapshot():
    result={}
    for table in TABLES:
        field='teacherId' if table=='StaffQrCard' else 'id'
        excluded=''.join(" - '"+key+"'" for key in NEW_COLUMNS)
        sql=f'''SELECT "{field}",md5((to_jsonb(t){excluded})::text) FROM "{table}" t ORDER BY "{field}";'''
        cmd=['docker','exec','oumouna_khadija_postgres','sh','-c','exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "$1"','sh',sql]
        out=subprocess.check_output(cmd,text=True).strip().splitlines()
        result[table]=dict(row.split('|',1) for row in out)
    return result
if __name__=='__main__':
    if os.geteuid()!=0:raise SystemExit('Run as root.')
    if len(sys.argv)!=3 or sys.argv[1] not in ['capture','verify']:raise SystemExit('Usage: capture|verify /private/baseline.json')
    path=Path(sys.argv[2]);current=snapshot()
    if sys.argv[1]=='capture':
        fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w') as f:json.dump(current,f)
        print('Baseline captured: '+str(path))
    else:
        previous=json.loads(path.read_text());changed=[table for table in previous if any(current.get(table,{}).get(key)!=value for key,value in previous[table].items())]
        print(json.dumps({'existing_rows_unchanged':not changed,'changed_tables':changed,'counts':{key:len(value) for key,value in current.items()},'new_rows':{key:len(set(value)-set(previous.get(key,{}))) for key,value in current.items()}}))
        if changed:raise SystemExit(1)
