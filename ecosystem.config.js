module.exports = {
  apps: [
    {
      name: 'regintel-api',
      cwd: './apps/api',
      script: 'pnpm',
      args: 'start',
      env: { NODE_ENV: 'production', PORT: 4001 },
    },
    {
      name: 'regintel-web',
      cwd: './apps/web',
      script: 'pnpm',
      args: 'start',
      env: { NODE_ENV: 'production', PORT: 4000 },
    },
  ],
};
