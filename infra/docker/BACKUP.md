# สำรองและกู้คืนข้อมูล (Backup & Restore)

ข้อมูลการเงินของวัดอยู่ใน Postgres ทั้งหมด (รวมไฟล์หลักฐานที่แนบ ซึ่งเก็บเป็น bytea
ในตาราง `attachments`) — สำรองฐานข้อมูลก้อนเดียวจึงครอบคลุมทุกอย่าง

## วิธีทำงาน

service `backup` ใน `docker-compose.prod.yml` รันอัตโนมัติ:

- ทุก `BACKUP_INTERVAL_SECONDS` (ค่าเริ่มต้น 86400 = วันละครั้ง) ทำ `pg_dump -Fc`
- เข้ารหัส AES-256 (PBKDF2 200k iterations) ด้วย `BACKUP_PASSPHRASE` จาก `.env`
- เขียนลง volume `wat_pg_backups` เป็น `wat-<db>-<UTC timestamp>.dump.enc`
- เก็บล่าสุด `BACKUP_KEEP` ไฟล์ (ค่าเริ่มต้น 14) ที่เหลือลบทิ้ง

ดูรายการ backup:

```sh
docker compose -f infra/docker/docker-compose.prod.yml exec backup ls -lh /backups
```

## สำคัญ: ต้องสำเนาออกนอกเครื่อง (offsite)

Backup ที่อยู่บนดิสก์เดียวกับฐานข้อมูลกันได้แค่ความผิดพลาดของคน ไม่กันดิสก์พัง/เครื่องหาย
ตั้ง cron บนโฮสต์ (หรือเครื่องอื่น) ให้ rsync/rclone ออกไปอย่างน้อยวันละครั้ง เช่น:

```sh
# หา path ของ volume แล้ว rclone ไป object storage
docker volume inspect wat_wat_pg_backups --format '{{ .Mountpoint }}'
rclone sync <mountpoint> remote:wat-backups/
```

ไฟล์เข้ารหัสแล้ว จึงปลอดภัยที่จะวางบน storage ภายนอก — แต่ **ห้ามเก็บ
`BACKUP_PASSPHRASE` ไว้ที่เดียวกับไฟล์ backup** และห้ามทำหาย (ไฟล์กู้ไม่ได้ถ้าไม่มี)

## กู้คืน (ทำลายข้อมูลปัจจุบัน — อ่านก่อนรัน)

```sh
docker compose -f infra/docker/docker-compose.prod.yml run --rm \
  -e RESTORE_CONFIRM=yes \
  --entrypoint /bin/sh backup /backup/restore.sh /backups/wat-<db>-<stamp>.dump.enc
```

หลังกู้คืน ถ้า dump เก่ากว่า migration ล่าสุด ให้รัน migrate ซ้ำ:

```sh
docker compose -f infra/docker/docker-compose.prod.yml up migrate
```

## ซ้อมกู้คืน (restore drill)

backup ที่ไม่เคยซ้อม restore = ไม่มี backup ทดสอบอย่างน้อยไตรมาสละครั้ง:

1. สร้าง Postgres เปล่าชั่วคราว: `docker run -d --name wat-restore-test -e POSTGRES_PASSWORD=test postgres:16-alpine`
2. ถอดรหัส + restore เข้าเครื่องทดสอบ (ใช้ `PGHOST`/`PGPASSWORD` ของเครื่องทดสอบ)
3. ตรวจว่าจำนวนแถวตารางหลัก (donations, ledger_entries, receipts) ตรงกับระบบจริง
4. ลบเครื่องทดสอบทิ้ง

## ขีดจำกัดที่รู้ (future work)

- ยังไม่มี WAL archiving — กู้คืนได้ถึง backup ล่าสุดเท่านั้น (สูญเสียได้มากสุด 1 รอบ
  interval) ถ้าวัดต้องการ point-in-time recovery ให้พิจารณา `wal-g` หรือ pgBackRest
- ไฟล์แนบเก็บใน DB ทำให้ dump โตตามไฟล์หลักฐาน — แผนระยะยาวคือย้าย blob ไป object
  storage แล้ว dump จะเล็กลงมาก
