# Dalin Mini Apps Sales Bot

Telegram Bot សម្រាប់លក់ StaffDay, Inventra និង Luyvio។ អតិថិជនអាចមើលផលិតផល ផ្ញើសំណួរ និងស្នើ Trial សម្រាប់ StaffDay។ អ្នកលក់ និង Owner ប្រើក្រុម Telegram ឯកជនដើម្បីទទួលសំណើ កត់ការផ្ទៀងផ្ទាត់ HR តាមដាន Trial និងគ្រប់គ្រងការបន្តប្រើ។

- **Telegram** ទទួលសំណើ បង្ហាញ Demo ផ្ញើសាររំលឹក និងគាំទ្រ។ ប្រើ Bot សម្រាប់លក់ដាច់ដោយឡែក។
- **Notion** បង្ហាញ Leads, Follow Up និង Orders ដែល sync ពី Bot។ កែស្ថានភាពពីក្រុម Telegram។ ការកែ properties ក្នុង Notion មិនប្ដូរស្ថានភាព Bot ទេ ហើយ sync បន្ទាប់អាចសរសេរជាន់ properties ដែល Bot គ្រប់គ្រង។
- **Railway** ដំណើរការ Bot ដោយប្រើ Docker និង Volume។ SQLite ក្នុង Volume រក្សាទុកសំណើ ការងារផ្ញើឡើងវិញ និងការទូទាត់។
- **GitHub** ផ្ទុក source និងតេស្ត CI។ ភ្ជាប់ repo ទៅ Railway សម្រាប់ autodeploy។

Bot នេះអនុវត្តផ្នែកលក់ និងការប្រគល់ទៅ StaffDay។ Owner បើកក្រុមហ៊ុន ឬកែសិទ្ធិក្នុង StaffDay រួចកត់សកម្មភាពក្នុង Bot លក់។ សំណុំកូដនេះអាចដាក់ក្នុង repo ថ្មី ដោយឯករាជ្យពី StaffDay និង Funan Techo Attendance Bot។

## ដំឡើង Telegram

1. បង្កើត Bot ថ្មីជាមួយ [BotFather](https://t.me/BotFather)។ រក្សា token ជា `BOT_TOKEN`។
2. បង្កើតក្រុម Telegram ឯកជនសម្រាប់ផ្នែកលក់ ហើយបន្ថែម Bot និងអ្នកលក់ដែលមានសិទ្ធិ។
3. កំណត់ `OWNER_IDS` និង `SELLER_IDS` ជា Telegram user ID លេខ។ ប្រើ comma ដើម្បីបំបែកលេខច្រើន។ ក្នុងក្រុមប្រើ command ជាទម្រង់ `/saleshelp@YourBotUsername` ដើម្បីឱ្យ Telegram បញ្ជូន command ទៅ Bot ខណៈ privacy mode បើក។
4. ចម្លង `.env.example` ទៅ `.env` ហើយដាក់ `BOT_TOKEN`។ ក្នុងក្រុមផ្ញើ `/chatid@YourBotUsername` ហើយក្នុង chat ឯកជនចុច Start និងផ្ញើ `/whoami` ពីគណនី Owner និងអ្នកលក់ម្នាក់ម្តង។ រត់ `npm run telegram:ids` មុនដាក់ Bot ឱ្យ long-poll លើ Railway។ Script បង្ហាញតែ Telegram ID និង `SALES_CHAT_ID`។ បញ្ចូលលេខទាំងនេះទៅក្នុង `.env`។

ពេល Bot ដំណើរការ Owner/Seller អាចសួរ `/chatid@YourBotUsername` ក្នុងក្រុម ហើយអ្នកប្រើផ្ញើ `/whoami` ក្នុង chat ឯកជន។ នៅក្នុង Bot លក់ ប្រើ `STAFFDAY_URL` ជាតំណ StaffDay ពិត និង `STAFFDAY_DEMO_URL` / `HR_REPORT_DEMO_URL` សម្រាប់វីដេអូ។ `STAFFDAY_PRICE_LABEL` ទុកទទេរហូតដល់អនុម័តតម្លៃសម្រាប់ផ្សព្វផ្សាយ។

ឧទាហរណ៍តំណផ្សព្វផ្សាយ `https://t.me/YourBotUsername?start=staffday_tiktok` និង `https://t.me/YourBotUsername?start=staffday_fb`។ ប្រើ Bot token មួយក្នុង service ដែលកំពុង long-poll តែមួយ។

## បង្កើតតារាង Notion

1. បង្កើត Notion internal integration ដែលអាច read, insert និង update content។ Share ទំព័រមេឯកជនទៅ integration តាម Connections។
2. ចម្លង `.env.example` ទៅ `.env` ហើយដាក់ `NOTION_TOKEN` និង `NOTION_PARENT_PAGE_ID`។ `NOTION_PARENT_PAGE_ID` ជា page ID របស់ទំព័រមេ។
3. ប្រើ Node.js 24 ហើយរត់ `npm ci` និង `npm run notion:setup`។ Script នឹងបង្កើតតារាង Leads, Follow Up និង Orders ប្រសិនបើតារាងមិនទាន់មាន រួចបង្ហាញ data source IDs។
4. ដាក់តម្លៃ `NOTION_LEADS_SOURCE_ID`, `NOTION_TASKS_SOURCE_ID` និង `NOTION_ORDERS_SOURCE_ID` ក្នុង `.env` ឬ Railway Variables។ Bot ប្រើ data source ID សម្រាប់ sync។ `NOTION_PARENT_PAGE_ID` ត្រូវការតែក្នុង script ដំឡើង។
5. រក្សា Notion ទំព័រលក់ឱ្យឯកជន ព្រោះមាន Telegram IDs និងសំណួររបស់អតិថិជន។

API របស់ Notion ក្នុង source ប្រើ `2025-09-03` និង `External ID` ដើម្បីរកកំណត់ត្រាដើមបើ sync សាកម្ដងទៀត។

## ដាក់លើ GitHub និង Railway

1. ពន្លា ZIP ហើយដាក់ឯកសារក្នុង GitHub repo ថ្មី។ រក្សា `.github/workflows/ci.yml` និង `.gitignore`។ បញ្ចូល `.env.example` ទៅ repo ហើយរក្សា credentials ក្នុង `.env` របស់ម៉ាស៊ីន ឬ Railway Variables។
2. ក្នុង Railway បង្កើត persistent service ពី GitHub repo នោះ។ Source root ត្រូវមាន `Dockerfile` និង `railway.json`។
3. ភ្ជាប់ Railway Volume ទៅ `/data` មុនចាប់ផ្ដើម app ហើយប្រើ replica មួយ។ Railway ផ្ដល់ `RAILWAY_VOLUME_MOUNT_PATH` នៅពេលភ្ជាប់ Volume។ HTTP `/health` ប្រើ Railway `PORT`។ Long polling អនុញ្ញាតឱ្យ Bot ដំណើរការដោយគ្មាន public domain។
4. ចម្លងតម្លៃពី `.env.example` ដែលត្រូវប្រើទៅ Railway Variables។ ទុក `ENABLE_STARS=false` ពេលសាក Trial ដំបូង។ ប្រើ `TRIAL_DAYS=14` ឬចំនួនថ្ងៃដែលបានអនុម័ត។
5. ផ្ទៀងផ្ទាត់ Railway បាន deploy។ ក្នុង Telegram បើក Bot រួចស្នើ Trial ហើយពិនិត្យថាក្រុមលក់ និង Notion ទទួលបានទិន្នន័យ។ កុំរត់ Bot ពីម៉ាស៊ីនក្នុងពេលដំណាលគ្នាជាមួយ Railway។
6. បើកការបម្រុងទុក Volume ដើម្បីរក្សាសំណើ និងស្ថានភាពការទូទាត់។ សំណុំកូដនេះប្រើ SQLite ដោយមាន WAL។ ការផ្ញើសារអាចស្ទួនក្នុងករណី Telegram បានទទួលសារ តែបណ្ដាញដាច់មុន Bot ទទួលចម្លើយ។ កុំចម្លងតែ `sales.sqlite` ខណៈ Bot កំពុងសរសេរ។

## លំហូរប្រើប្រាស់

| ដំណាក់កាល | សកម្មភាព |
|---|---|
| មើលផលិតផល | អតិថិជនប្រើ `/start`។ StaffDay មាន Demo និង Trial។ Inventra និង Luyvio មានព័ត៌មាន និងទទួលសំណួរ។ |
| ស្នើ Trial | បញ្ចូលក្រុមហ៊ុន និងចំនួនបុគ្គលិក រួចចុចបញ្ជាក់។ ប្រើ `/my` ដើម្បីមើលលេខសំណើ និងស្ថានភាព។ |
| ពិនិត្យសំណើ | ចុចទទួលការងារ ឬ `/claim SD-0001`។ ពិនិត្យថាក្រុមហ៊ុនមានសំណើរួច និងផ្ទៀងផ្ទាត់ HR តាមការទាក់ទង។ កត់ `/verify SD-0001 123456789 1 Office shift`។ |
| បើក Trial | Owner បើកក្រុមហ៊ុនក្នុង StaffDay រួចកត់ `/trial SD-0001 LOTUS-01`។ អតិថិជនទទួលតំណ និងថ្ងៃផុតកំណត់។ បើ HR ជាអ្នកផ្សេង អ្នកស្នើបញ្ជូនតំណឱ្យ HR។ |
| ប្រគល់ទៅ HR | HR កំណត់ទីតាំង វេន និងបុគ្គលិកម្នាក់ រួចសាក Check In, Check Out និង Monthly Report ក្នុង StaffDay។ កត់ `/used SD-0001` ក្រោយបានផ្ទៀងផ្ទាត់ការសាកប្រើ។ |
| តាមដាន | Bot ជូនដំណឹងទៅក្រុមលក់នៅថ្ងៃទី ៣ និងរំលឹកអតិថិជនមុនផុត Trial ២ ថ្ងៃ។ ក្រោយដល់ថ្ងៃផុត Bot ជូនដំណឹងដល់ក្រុមលក់ឱ្យកត់សេចក្ដីសម្រេច។ |
| ពន្យារ ឬផ្អាក | Owner ផ្ទៀងផ្ទាត់សិទ្ធិដែលបានកែពិតប្រាកដក្នុង StaffDay រួចកត់ `/extend SD-0001 7` ឬ `/pause SD-0001`។ `/close SD-0001` បិទសំណើដែលបានដោះស្រាយសិទ្ធិរួច។ |
| បន្តប្រើ | អតិថិជនចុចស្នើបន្តពី `/my`។ Owner បើកសិទ្ធិក្នុង StaffDay លើ Company Code ដដែល រួចកត់ `/active SD-0001 YYYY-MM-DD`។ ថ្ងៃដែលវាយមានន័យថាប្រើបានដល់ចប់ថ្ងៃនោះតាមម៉ោងកម្ពុជា។ |
| ជំនួយ | អតិថិជនប្រើ `/support` ឬ `/paysupport`។ អ្នកលក់ប្រើ `/reply TK-0001 MESSAGE` និង `/resolve TK-0001` ក្នុងក្រុមឯកជន។ |
| របាយការណ៍ និងកំហុស | `/salesreport` សង្ខេប ៧ ថ្ងៃពេញមុនថ្ងៃនេះតាមម៉ោងកម្ពុជា។ `/failed` បង្ហាញការផ្ញើ/Notion ដែលបរាជ័យ។ Owner ប្រើ `/retry JOB_ID`។ |

ពេលបើក privacy mode បន្ថែម `@YourBotUsername` ក្រោយ command និងមុន arguments។ ឧទាហរណ៍ `/trial@YourBotUsername SD-0001 LOTUS-01`។ បញ្ជី command ពេញ `/saleshelp@YourBotUsername`។

## ការទូទាត់ Telegram Stars

បើក `ENABLE_STARS=true` បន្ទាប់ពីអនុម័តតម្លៃ `STAFFDAY_PRICE_XTR` និងបានសាកនៅ Telegram test environment ឬលើ Bot សាកល្បងដែលបានកំណត់ដោយឡែក។ `/invoice SD-0001` ផ្ញើ invoice សម្រាប់រយៈពេល ១ ខែទៅគណនីអ្នកស្នើ។ Bot ផ្ទៀងផ្ទាត់ order បរិមាណ និងអ្នកទូទាត់ពេល pre-checkout ហើយប្រើ success event របស់ Telegram ដើម្បីកត់ថាបង់រួច។ ក្រោយកត់ Active ម្តង Order នោះប្ដូរទៅ delivered។ ការបន្តបន្ទាប់ត្រូវឱ្យ Owner ផ្ញើ invoice ថ្មីតាមសំណើ។ ប្រើ `/voidinvoice ORD-0001` ដើម្បីបិទ invoice មិនទាន់បង់។ `/refund ORD-0001` សម្រាប់ Owner ក្នុងក្រុមលក់ ហើយបង្កើតការងារពិនិត្យសិទ្ធិ StaffDay ក្រោយសងប្រាក់។ តម្លៃ USD ដែលធ្លាប់ស្នើ និងលេខ XTR ក្នុងរូប UI ជាគំរូផ្សេងៗ។

## តេស្ត

```bash
npm ci
npm test
npm start
```

តេស្តក្នុង repo ប្រើ Telegram និង Notion ក្លែងសម្រាប់ពិនិត្យសំណើស្ទួន សិទ្ធិ Owner ពេល Trial និងការទូទាត់។ ពេលសាក live ប្រើក្រុមហ៊ុនគំរូពីរ ហើយផ្ទៀងផ្ទាត់ថា HR ម្នាក់ៗអាចចូលតែក្រុមហ៊ុនរបស់ខ្លួនក្នុង StaffDay។ ក្នុង Notion ត្រូវឃើញ External ID ដដែលពេលសំណើប្ដូរស្ថានភាព។

ឯកសារផ្លូវការ

- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Telegram Stars](https://core.telegram.org/bots/payments-stars)
- [Notion data sources](https://developers.notion.com/reference/query-a-data-source)
- [Railway volumes](https://docs.railway.com/volumes)
