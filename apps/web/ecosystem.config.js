module.exports={
  "apps": [
    {
      "name": "regintel-web",
      "script": ".next/standalone/server.js",
      "env": {
        "NODE_ENV": "production",
        "PORT": "4000",
        "HOSTNAME": "0.0.0.0",
        "NEXT_PUBLIC_API_BASE_URL": "/api",
        "NEXT_PUBLIC_CLERK_SIGN_IN_URL": "/sign-in",
        "NEXT_PUBLIC_CLERK_SIGN_UP_URL": "/sign-up",
        "NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL": "/",
        "NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL": "/",
        "API_INTERNAL_URL": "http://localhost:4001",
        "E2E_TEST_MODE": "false",
        "NEXT_PUBLIC_E2E_TEST_MODE": "false",
        "BLOB_STORAGE_PATH": "/var/regintel/evidence-blobs",
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY": "pk_live_Y2xlcmsucmVnaW50ZWxpYS5jby51ayQ",
        "DATABASE_URL": "YOUR_DATABASE_URL_HERE"
      }
    }
  ]
}
