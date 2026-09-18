# 🚢 SMARTCREW DEEPSEEK HARNESS

**دليل عملي · Open Source · MIT License · Developer Preview**

مسخّر وكيل (agent harness) مفتوح المصدر يتيح **التبديل بين نماذج الذكاء الاصطناعي
دون فقدان الذاكرة المعرفية** التي تستند إليها قرارات النظام. النموذج هو "العقل"
القابل للاستبدال، والذاكرة المعرفية هي "الذهن" الثابت الذي يبقى عبر كل النماذج.

> An open-source agent harness that lets you **swap AI models without losing the
> knowledge memory** your decisions rely on. The model is a replaceable *brain*;
> the memory is the persistent *mind*.

---

## ✨ الفكرة الجوهرية / The core idea

في معظم الأدوات تكون الذاكرة مرتبطة بالنموذج، فإذا بدّلت النموذج فقدت السياق.
هنا الذاكرة **منفصلة تماماً** (model-agnostic) ومخزّنة على القرص، ويُعاد حقنها
في أي نموذج تختاره:

```
        ┌──────────── يمكن استبداله (swappable) ────────────┐
        │   DeepSeek   │   Claude   │   OpenAI   │  Ollama   │
        └───────┬──────┴──────┬─────┴──────┬─────┴─────┬─────┘
                │             │            │           │
                ▼             ▼            ▼           ▼
        ┌───────────────────────────────────────────────────┐
        │        Agent Loop  (Cordis-style)                  │
        │        Tools  ·  Model adapter                     │
        └───────────────────────┬───────────────────────────┘
                                 │  inject / retrieve
                                 ▼
        ┌───────────────────────────────────────────────────┐
        │   KNOWLEDGE MEMORY  (ثابتة · على القرص · JSONL)     │
        │   knowledge · decisions · working · facts          │
        └───────────────────────────────────────────────────┘
```

عند التبديل: **لقطة تلقائية → إعادة حقن السياق → تسجيل المصدر (provenance)**.
لا يُفقد أي أساس معرفي.

---

## 📦 التثبيت والتشغيل / Install & Run

يعمل على **Node.js ≥ 20** بلا أي تبعيات خارجية (dependency-free).

```bash
cd smartcrew
cp .env.example .env      # ضع مفاتيح API للنماذج التي ستستخدمها
node bin/dsh.js web       # الواجهة على http://localhost:3080
```

أو كمشروع npm مستقل:

```bash
npm start                 # = node bin/dsh.js
npm run web               # الواجهة
npm test                  # الاختبارات
```

---

## 🖥️ أوامر CLI

| الأمر | الوظيفة |
|------|---------|
| `dsh web` | تشغيل الواجهة المحلية (المنفذ 3080) |
| `dsh chat` | محادثة تفاعلية في الطرفية |
| `dsh models` | عرض النماذج المُعرَّفة وحالة المفاتيح |
| `dsh use <id>` | **تبديل النموذج النشط (مع حفظ الذاكرة)** |
| `dsh remember <text>` | إضافة معرفة دائمة |
| `dsh memory` | إحصاءات طبقات الذاكرة + آخر القرارات |
| `dsh snapshot` | أخذ لقطة يدوية للذاكرة |

مثال يوضح استمرار الذاكرة عبر التبديل:

```bash
dsh remember "النظام يفضّل الحلول منخفضة التكلفة للمهام كبيرة الحجم"
dsh use claude          # لقطة تلقائية + إعادة حقن
dsh memory              # المعرفة السابقة لا تزال موجودة ✓
```

---

## ⚙️ التكوين / Configuration — `smartcrew.config.toml`

كل شيء يُضبط من ملف TOML واحد:

- `[[model]]` — سجل النماذج (DeepSeek / Claude / OpenAI / Ollama محلي). المفاتيح
  تُقرأ من متغيرات البيئة عبر `api_key_env` فقط.
- `[switching]` — سياسة التبديل: `persist_memory_on_switch`,
  `rehydrate_memory_on_switch`, `track_provenance`, وقواعد التوجيه التلقائي
  `[[switching.route]]`.
- `[memory]` — **طبقة الذاكرة المعرفية**: الطبقات، الاحتفاظ، وإستراتيجية الحقن.
- `[[tool]]` — الأدوات (Everything is a Plugin).
- `[integrations]` — Zapier، والوكلاء الفرعية (Codex / Claude Code).
- `[safety]` — التأكيدات وإخفاء الأسرار في السجلات.

---

## 🧩 المعمارية / Architecture

مبنية على معمارية **Cordis**: `Agent Loop + Memory + Tools + Model`.
كل مكوّن إضافة (plugin) قابلة للاستبدال.

```
src/
├─ toml.js       محلّل TOML صغير بلا تبعيات
├─ config.js     تحميل وفحص التكوين
├─ memory.js     ★ الذاكرة المعرفية المستقلة عن النموذج
├─ model.js      محوِّل نماذج (OpenAI-compatible + Anthropic)
├─ switcher.js   التبديل بلا فقدان + التوجيه التلقائي
├─ agent.js      حلقة الوكيل (تربط الذاكرة بالنموذج)
└─ web.js        واجهة ويب + API عبر node:http
bin/dsh.js       واجهة سطر الأوامر
```

---

## 🔀 أنماط العمل الأربعة / The Four Modes

- **Standard** — وكيل البرمجة الكامل والافتراضي.
- **PTC** — قدرات Standard + إتاحة الأدوات عبر SDK داخل برنامج TypeScript واحد.
- **Minimal** — نمط مبسّط وخفيف للأعمال السريعة.
- **Creator** — تصميم وكلاء جاهزين وفحص وقت التشغيل.

يُضبط النمط من `[runtime].mode`.

---

## 🤔 متى تستخدم ماذا؟

- **Claude** — مخرجات نهائية موجهة للعملاء (client-facing) واللمسة المصقولة.
- **DeepSeek** — مهام كبيرة الحجم، كفاءة عالية وتكلفة منخفضة.
- **Ollama محلي** — تشغيل مجاني بالكامل وبلا إنترنت.

القرار قد يتم تلقائياً عبر قواعد `[[switching.route]]`.

---

## ❓ FAQ

- **مجاني؟** نعم بالكامل تحت رخصة MIT — تدفع فقط مقابل استهلاك Tokens عبر مفاتيحك.
- **هل تغادر البيانات الجهاز؟** لا، يعمل محلياً افتراضياً (`local_only = true`).
- **النماذج المحلية؟** نعم عبر Ollama.
- **اشتراك Claude Code؟** لا، يتطلب مفاتيح API.

---

## 🛡️ الأمان / Safety

اقرأ [SAFETY.md](./SAFETY.md) قبل التشغيل.

## 📄 الرخصة / License

[MIT](./LICENSE) © 2026 SMARTCREW
