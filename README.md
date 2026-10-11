# Amar Pratishthan: website with admin panel and enquiry emails

A full-stack website. Visitors see the trust's pages and photo gallery. The administrator logs in at `/admin.html` to upload photos and read enquiries. Every enquiry is saved in the database **and** emailed to the trust.

## How it works (for your viva / explaining to mam)

```
 Visitor's browser                       Server (Node.js + Express)                Services
 -----------------                       --------------------------                --------
 index.html / style.css / script.js  <-->  server.js  (the API)              <-->  MongoDB Atlas  (photo details, enquiries)
 admin.html / admin.js                                                      <-->  Cloudinary     (the photo files)
                                                                            <-->  Brevo          (sends the email)
        FRONTEND  (HTML, CSS, JS)               BACKEND  (JavaScript on Node.js)
```

| Part | Technology | Where |
|---|---|---|
| Frontend (what people see) | HTML, CSS, JavaScript | `public/` |
| Backend (logic, security) | Node.js + Express | `server.js` |
| Database | MongoDB (via Mongoose) | `models/` |
| Photo storage | Cloudinary | used in `server.js` |
| Email | Brevo API | `sendEnquiryEmail()` in `server.js` |

Only one programming language is used everywhere: **JavaScript**.

## Folder structure (all files in one folder)

```
server.js                    the backend: API routes, login, uploads, email
Photo.js, Message.js         shape of a gallery photo / an enquiry in the database
index.html, style.css, script.js     the public website
admin.html, admin.css, admin.js      the admin panel
logo.png and 4 PDF files             logo and the trust's documents
.env.example                 list of settings you must fill in (copy to .env)
package.json                 list of libraries the project uses
```

## Step 1: Create the free accounts (about 20 minutes)

### 1a. MongoDB Atlas (database)
1. Sign up at mongodb.com/atlas and create a **free (M0)** cluster.
2. **Database Access** > Add Database User. Give a username and a password made only of letters and numbers.
3. **Network Access** > Add IP Address > **Allow access from anywhere** (`0.0.0.0/0`). This is needed because the hosting server's address changes.
4. **Database** > Connect > Drivers. Copy the connection string. Replace `<password>` with your password and put the database name before the `?`, like `.../amar-pratishthan?retryWrites=...`. This is your `MONGODB_URI`.

### 1b. Cloudinary (photo storage)
Sign up at cloudinary.com (free). The dashboard shows **Cloud name**, **API Key** and **API Secret**.

### 1c. Brevo (sends the enquiry emails)
1. Sign up at brevo.com (free: 300 emails/day).
2. **Senders, Domains & Dedicated IPs** > Senders > add `pratishthanamar@gmail.com` and click the verification link Brevo emails to it.
3. **SMTP & API** > **API Keys** > generate a key. This is your `BREVO_API_KEY`.

> Why Brevo and not Gmail directly? The free hosting plan (Render) blocks the ports Gmail uses, so the server sends email over a normal web request instead.

## Step 2: Run it on your own computer

1. Install Node.js (the LTS version) from nodejs.org.
2. Open this folder in VS Code, then open the terminal (Terminal > New Terminal).
3. Run `npm install`
4. Copy `.env.example` to a new file named `.env` and fill in every value. To make `JWT_SECRET`, run:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
5. Run `npm start` and open http://localhost:3000
6. Go to http://localhost:3000/admin.html, log in, upload a photo, then check the home page. Send a test enquiry from the Contact section.

## Step 3: Put it online with a real link (Render)

1. Create a free GitHub account and a new repository. In the VS Code terminal:
   ```
   git init
   git add .
   git commit -m "Amar Pratishthan website"
   git branch -M main
   git remote add origin https://github.com/YOUR-NAME/YOUR-REPO.git
   git push -u origin main
   ```
   (`.gitignore` already keeps your secret `.env` and `node_modules` off GitHub.)
2. Sign up at render.com with GitHub. **New > Web Service** and pick your repository.
3. Settings: **Build Command** `npm install`, **Start Command** `npm start`, **Instance type** Free, **Region** Singapore (closest to Mumbai).
4. Under **Environment**, add every line from your `.env` one by one, plus `NODE_ENV` = `production`. Do not add `PORT`.
5. Click **Deploy**. After a few minutes you get a link like `https://your-name.onrender.com`. The admin panel is at `/admin.html`.

## Using the admin panel
- **Add a photo:** choose category, area, optional caption, pick the photo, click Upload. It appears on the public gallery straight away for everyone.
- **Delete a photo:** press Delete under it.
- **Enquiries:** every message sent from the Contact form is listed here, newest first, with unread ones highlighted. The same message also arrives in `pratishthanamar@gmail.com`; pressing Reply there answers the visitor directly.

## Things to know
- **Free hosting sleeps.** After about 15 minutes with no visitors, Render pauses the site and the next visitor waits around 30 to 60 seconds. Open the link once before showing it to anyone.
- **Check the Spam folder** for the first enquiry email and mark it "Not spam". Emails sent on behalf of a Gmail address are sometimes filtered. Even if an email is delayed, **no enquiry is lost**: it is always saved and shown in the admin panel.
- **Change the admin password** by editing `ADMIN_PASSWORD` in Render's Environment settings and redeploying. Use a long password and do not share it.
- **Never upload `.env`** to GitHub or send it to anyone. It holds your secret keys.

## Security measures built in
Passwords are checked in constant time. Login is a signed, HTTP-only cookie that expires after 8 hours and is blocked from cross-site use. Login attempts and enquiry sends are rate-limited. Uploads are limited to 8 MB and to image types. The enquiry form has a hidden bot trap field. Text from visitors is never inserted as raw HTML, so it cannot inject scripts. Standard security headers are set with Helmet.
