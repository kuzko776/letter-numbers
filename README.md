# نظام حجز أرقام الخطابات

تطبيق مجموعة العمرو للاستشارات الهندسية. الواجهة ثابتة وتُنشر على GitHub Pages، والبيانات والحسابات على Supabase (Postgres + Auth). ينشئ المدير حسابات الموظفين مباشرة بالاسم والبريد وكلمة المرور، ويحجز الموظف رقمًا بإدخال موضوع الخطاب، ويبحث المدير في سجل الشركة.

يبدأ الترقيم من `0001-48` في 1448 هـ ويعود إلى `0001-49` في 1449 هـ (تقويم أم القرى بتوقيت الرياض، من جدول `hijri_years`). الحد الأقصى 9999 حجزًا في السنة. لتوليد جدول السنوات من جديد: `node tools/gen-hijri.mjs`.

## الإعداد

1. أنشئ مشروعًا في [supabase.com](https://supabase.com).
2. من **SQL Editor** نفّذ محتوى `supabase/schema.sql` كاملًا.
3. من **Authentication → Providers → Email** عطّل **Confirm email** (وعطّل التسجيل الذاتي من **Sign In / Providers → Allow new users to sign up**).
4. من **Authentication → Users → Add user** أنشئ حساب المدير (مع **Auto Confirm User**)، ثم نفّذ في SQL Editor:
   `select public.make_admin('بريد-المدير@example.com', 'اسم المدير');`
5. ضع `Project URL` و`anon public key` (من **Project Settings → API**) في `web/config.js` وادفع إلى `main`.
6. في GitHub: **Settings → Pages → Source = GitHub Actions**. يُنشر الموقع تلقائيًا عند كل دفع.

مفتاح `anon` مصمَّم ليكون عامًا؛ الجداول مغلقة بالكامل (RLS) والوصول عبر دوال قاعدة البيانات فقط التي تتحقق من الدور والحساب المفعّل. لا تضع مفتاح `service_role` في المستودع أبدًا.
