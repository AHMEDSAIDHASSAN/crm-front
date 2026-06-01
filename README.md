# SIRA CRM — Frontend

React 19 + TypeScript + Vite + Tailwind CSS

## متطلبات التشغيل

- Node.js 18+
- الـ Backend شغال على port 2003

## خطوات الإعداد

### 1. تحميل المتطلبات
```bash
npm install
```

### 2. إعداد ملف البيئة (اختياري)
الـ frontend بيتوصل بالـ backend تلقائياً على `localhost:2003`.
لو الـ backend على سيرفر تاني:
```bash
# أنشئ ملف .env.local
VITE_API_PROXY_TARGET=http://YOUR_SERVER_IP:2003
```

### 3. تشغيل الـ Frontend
```bash
# Development
npm run dev
```
الـ frontend بيشتغل على **port 5173**.

### 4. Build للـ Production
```bash
npm run build
```

---

## الـ Admin الافتراضي

```
Email: admin@sira.com
Password: Admin123!
```

---

## الصفحات الرئيسية

| الصفحة | الوصف |
|--------|--------|
| `/dashboard` | لوحة التحكم |
| `/leads` | إدارة الليدز |
| `/units` | الوحدات العقارية |
| `/meetings` | الاجتماعات |
| `/sales-assistant` | مساعد المبيعات والحاسبة |
| `/settings/whatsapp-connect` | ربط WhatsApp |
| `/whatsapp-broadcast` | إرسال واتساب جماعي |

---

## الأدوار

| الدور | الصلاحيات |
|-------|-----------|
| `super_admin` | كل الصلاحيات |
| `operation_manager` | تعيين ليدز للمبيعات |
| `sales_manager` | إدارة الفرق |
| `sales` | متابعة الليدز الخاصة به |
