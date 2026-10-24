import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: ({ browser }) => ({
    name: 'Kavach',
    description: 'Masks Indian personal data before it reaches cloud chatbots, using open-weight AI on your own laptop.',
    permissions: ['storage'],
    // The local engine. Nothing else is ever contacted.
    host_permissions: ['http://127.0.0.1:8000/*'],
    ...(browser === 'firefox' && {
      browser_specific_settings: { gecko: { id: 'kavach@nst-hackday', strict_min_version: '128.0' } },
    }),
  }),
});
