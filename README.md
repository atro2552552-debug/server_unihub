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

## Cloud storage (Supabase Storage)

Create these three private Storage buckets in the same Supabase project:

- `course-files` for course files and summaries (50 MB file limit)
- `image-posts` for post images
- `profile-avatars` for profile pictures

The server routes each object to its bucket based on its storage key. Existing objects uploaded by the previous single-bucket setup are still read from `SUPABASE_STORAGE_BUCKET` (which defaults to `course-files`).

In `~/server/.env`, configure the project URL and a server-side key. The new `sb_secret_...` key is preferred; the old `service_role` key remains supported for existing deployments:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
# Optional bucket-name overrides (these are the defaults):
SUPABASE_COURSE_FILES_BUCKET=course-files
SUPABASE_IMAGE_POSTS_BUCKET=image-posts
SUPABASE_PROFILE_AVATARS_BUCKET=profile-avatars
# Optional when reading objects from the old single-bucket layout:
SUPABASE_STORAGE_BUCKET=course-files
```

For a legacy key, use `SUPABASE_SERVICE_ROLE_KEY` instead of `SUPABASE_SECRET_KEY`. Keep either server key out of the client and do not share it publicly. Copy the updated server source files to `~/server`, run `npm install`, and restart the server. Supabase's Free plan currently includes 1 GB of file storage and 5 GB of egress, with a 50 MB maximum upload size. Free projects may pause after a week of inactivity. Usage beyond plan quotas requires a plan change or can incur charges; check the current Supabase usage page.

Existing file records continue to download from the server's `uploads` directory. To move them into Supabase, copy `server/migrateFilesToSupabase.js` to `~/server` and run `node migrateFilesToSupabase.js`. This copies them and updates MongoDB while keeping the local copies. After checking that the files work, run `node migrateFilesToSupabase.js --delete-local` to remove those local copies.
