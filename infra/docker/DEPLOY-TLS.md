# TLS (HTTPS) สำหรับ production

สแต็ก `docker-compose.prod.yml` เปิดพอร์ต HTTP (`WEB_PUBLIC_PORT`, ค่าเริ่มต้น 8080)
เท่านั้น — **ห้ามให้ผู้ใช้จริงเข้าผ่าน HTTP ตรง ๆ**: ระบบนี้ส่งรหัสผ่านและ token
การเงินของวัดทุก request ต้องมี TLS terminator ขวางหน้าเสมอ

## ทางเลือกที่แนะนำ: Caddy บนโฮสต์ (ออกใบรับรอง Let's Encrypt อัตโนมัติ)

```sh
apt install caddy   # หรือ docker run caddy
```

`/etc/caddy/Caddyfile`:

```caddyfile
temple.example.com {
    reverse_proxy 127.0.0.1:8080
    header Strict-Transport-Security "max-age=31536000; includeSubDomains"
}
```

Caddy ขอ/ต่ออายุใบรับรองเองอัตโนมัติ จบ

## ทางเลือก: nginx บนโฮสต์ + certbot

```nginx
server {
    listen 443 ssl http2;
    server_name temple.example.com;
    ssl_certificate     /etc/letsencrypt/live/temple.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/temple.example.com/privkey.pem;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        client_max_body_size 13m;   # อัปโหลดหลักฐาน ~12 MB
    }
}
server {
    listen 80;
    server_name temple.example.com;
    return 301 https://$host$request_uri;
}
```

ออกใบรับรอง: `certbot certonly --nginx -d temple.example.com`

## อย่าลืมปรับ TRUST_PROXY

เมื่อมี proxy เพิ่มอีกชั้นหน้าคอนเทนเนอร์ web (รวมเป็น 2 hops: host proxy + nginx
ในคอนเทนเนอร์) ให้ตั้งใน `.env`:

```
TRUST_PROXY=2
```

ไม่อย่างนั้น rate limiting จะคิดเลขจาก IP ของ proxy แทน IP ผู้ใช้จริง

## เช็กหลังเปิดใช้

- `curl -I https://temple.example.com` ได้ 200 + เห็น `strict-transport-security`
- `curl -I http://temple.example.com` ถูก redirect ไป https
- ล็อกอินผ่านหน้าเว็บได้ปกติ และอัปโหลดไฟล์แนบ ~5 MB ผ่าน
