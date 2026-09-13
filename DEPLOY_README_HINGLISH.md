# Wellversed FAM — Secure Deployment (Hinglish)

## Ab dashboard ka behaviour
1. Login ke bina **koi dashboard data render nahi hoga**.
2. Google se verified `@wellversed.in` account login hone ke baad server live Google Sheets se shared FAM data fetch karega.
3. **Overview ka existing layout/count logic same rakha gaya hai**; data ab authenticated live backend se aata hai.
4. Top-right profile icon se **My Workspace** open hoga.
5. My Workspace mein har user apni Google Sheet URL/ID connect kar sakta hai.
6. Personal sheet ko service account email ke saath **Viewer** share karna zaroori hai. Service account email UI mein automatically dikh jayega.
7. Personal connections email ke saath isolate hain; ek user doosre user ki connection/data nahi dekh sakta.
8. Personal data open page par har 2 minute auto-refresh hota hai aur **Refresh now** button bhi hai.
9. Admin/Trash sirf `manish.kumar@wellversed.in` ke liye visible hai.

## Netlify variables
Existing variables ko preserve rakho:
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GOOGLE_SHEET_ID`
- `GOOGLE_KNO_SHEET_ID`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_ALLOWED_DOMAIN`

Optional:
- `GOOGLE_ADMIN_EMAIL=manish.kumar@wellversed.in`

## Production OAuth Client
`255689281984-2t3k3fe19srh84tnjqk3um3psfda58ie.apps.googleusercontent.com`

Google Cloud → Google Auth Platform → Clients → Web application:
- Authorized JavaScript origin: `https://wellversed-fam-dashboard-new.netlify.app`
- Local origin (optional): `http://localhost:3000`

## Personal Google Sheet flow
- Login → My Workspace → Paste Google Sheet URL → Add Sheet.
- Backend pehle sheet access test karega; access na ho to connection save nahi hogi.
- Sheet ko service account ke saath Viewer share karo.
- Connected sheet ka data sirf usi Google email ko return hota hai jisne connection add kiya.

## Security
- Public client bundle mein dashboard snapshot nahi hai.
- Sign-out par browser-side dashboard cache clear hota hai.
- Account switch par persisted data isolate/clear hota hai.
- Private key GitHub mein kabhi upload mat karo.
