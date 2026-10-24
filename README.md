# Server setup (Termux)

Keep the server files together in `~/server`, including `package.json`, `.env`, and `seedAdmins.js`.

```sh
cd ~/server
ls seedAdmins.js
npm install
npm run seed:admins
npm start
```

If `ls seedAdmins.js` says the file is missing, copy `server/seedAdmins.js` from this project into `~/server` first. Installing npm packages does not copy project source files.

Admin permissions are stored in each user's MongoDB document as `role: "admin"`. Register the accounts first, then put their email addresses in the `adminEmails` list in `seedAdmins.js` and run `npm run seed:admins` once. The script only changes those accounts' roles; it does not set or reset passwords. `MONGO_URI` and `JWT_SECRET` remain in `.env` because the server still needs them to connect to MongoDB and sign login tokens. `ADMIN_EMAILS` and `ADMIN_SEED_USERS` are no longer used.

If an admin forgot a password, copy `resetAdminPasswords.js` to `~/server` and run `node resetAdminPasswords.js` in Termux. It asks for new passwords without showing the typed characters and stores only bcrypt hashes in MongoDB.

The web client is hosted separately. Point the tunnel URL in `client/config.js` at this server's API/Socket.IO endpoint.

## Cloud file storage (Supabase Storage)

New course files and summaries are stored in a private Supabase Storage bucket. Downloads still go through the app server, so the bucket does not need a public URL and the service key stays on the server.

Create a Supabase project and a private Storage bucket named `course-files`. Set the bucket's file size limit to 50 MB. In `~/server/.env` on the device running the server, add the project URL, a server-side `service_role` key, and the bucket name:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_server_side_service_role_key
SUPABASE_STORAGE_BUCKET=course-files
```

Keep `SUPABASE_SERVICE_ROLE_KEY` out of the client and do not share it publicly. Copy the updated `server/package.json`, `server/package-lock.json`, and server source files to `~/server`, run `npm install`, and restart the server. Supabase's Free plan currently includes 1 GB of file storage and 5 GB of egress, with a 50 MB maximum upload size. Free projects may pause after a week of inactivity. Usage beyond plan quotas requires a plan change or can incur charges; check the current Supabase usage page.

Existing file records continue to download from the server's `uploads` directory. To move them into Supabase, copy `server/migrateFilesToSupabase.js` to `~/server` and run `node migrateFilesToSupabase.js`. This copies them and updates MongoDB while keeping the local copies. After checking that the files work, run `node migrateFilesToSupabase.js --delete-local` to remove those local copies.
