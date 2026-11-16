# Dalin Mini Apps · Catalog source

ZIP នេះមានតែឯកសារសម្រាប់បន្ថែមម៉ឺនុយក្នុង Sales Bot និងកាតាឡុកតាមគំរូ។

## ដាក់ Source ចូល

1. ពន្លា ZIP ទៅក្នុង root នៃ repo `Dalin-mini-app-Store`។ ដាក់ `src/` និង `public/` តាមទីតាំងក្នុង ZIP។
2. ក្នុង Railway > Sales Bot service > Networking បើក Public Domain ប្រសិនបើមិនទាន់មាន។ ក្នុង Variables ដាក់ `CATALOG_PUBLIC_URL` ជា HTTPS origin របស់ **Sales Bot service**។ ឧទាហរណ៍ `https://your-sales-bot.up.railway.app`។ ដាក់ត្រឹម domain ដោយគ្មាន `/catalog/` នៅចុង។
3. រត់ `npm test` (Node.js 24)។ Deploy code ទៅ Sales Bot service ដែលប្រើ SQLite volume ស្រាប់។
4. ក្នុង Chat ឯកជននៃ Sales Bot ផ្ញើ `/start` → ចុច **មើលផលិតផល**។ សាកប្ដូរភាសា រួចចុចកាតផលិតផល ឬប៊ូតុងខាងក្រោម។

| ប៊ូតុង | លទ្ធផលក្នុង Telegram Chat |
| --- | --- |
| StaffDay | បង្ហាញព័ត៌មាន និងប៊ូតុងស្នើសាកល្បង។ បន្តតាមលំហូរ Trial របស់ Sales Bot។ |
| Inventra / Luyvio | បង្ហាញព័ត៌មានផលិតផល និងប៊ូតុងទាក់ទងក្រុមលក់សម្រាប់ផលិតផលដែលបានជ្រើស។ |
| សំណើរបស់ខ្ញុំ / My requests | បង្ហាញសំណើ StaffDay របស់គណនីដែលបានបើកកាតាឡុក។ |
| ទាក់ទងក្រុមលក់ / Contact sales | ស្នើឱ្យអតិថិជនវាយសំណួរក្នុង Chat សម្រាប់ក្រុមលក់។ |

ភាសាខ្មែរ / English អនុវត្តលើកាតាឡុក ម៉ឺនុយ និងសារដំបូងពេលជ្រើសផលិតផល។ កាតាឡុករក្សាជម្រើសភាសាតាមគណនី Telegram។ ប្រើ `/catalog/` ក្នុង browser ដើម្បីមើល UI និងបើកពី Bot ដើម្បីប្រើប៊ូតុងដែលបន្តទៅ Chat។
