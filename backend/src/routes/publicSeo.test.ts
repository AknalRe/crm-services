import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import publicSeoRouter from './publicSeo';

test('publicSeoRouter serves robots.txt, sitemap.xml, llms.txt, llms-full.txt and SSR landing HTML', async () => {
  const app = Fastify();
  await app.register(publicSeoRouter, { prefix: '/api/public/seo' });

  const robotsRes = await app.inject({
    method: 'GET',
    url: '/api/public/seo/robots.txt',
    headers: {
      'x-forwarded-host': 'panel.reneo.my.id',
      'x-forwarded-proto': 'https',
      'x-forwarded-prefix': '/app/reneo-crm',
    },
  });
  assert.equal(robotsRes.statusCode, 200);
  assert.match(robotsRes.body, /OAI-SearchBot/);
  assert.match(robotsRes.body, /ChatGPT-User/);
  assert.match(robotsRes.body, /GPTBot/);
  assert.match(robotsRes.body, /Sitemap: https:\/\/panel\.reneo\.my\.id\/app\/reneo-crm\/sitemap\.xml/);

  const sitemapRes = await app.inject({
    method: 'GET',
    url: '/api/public/seo/sitemap.xml',
    headers: {
      host: 'crm.toko.example',
      'x-forwarded-proto': 'https',
    },
  });
  assert.equal(sitemapRes.statusCode, 200);
  assert.match(sitemapRes.body, /<loc>https:\/\/crm\.toko\.example\/<\/loc>/);
  assert.match(sitemapRes.body, /<loc>https:\/\/crm\.toko\.example\/landing<\/loc>/);

  const llmsRes = await app.inject({
    method: 'GET',
    url: '/api/public/seo/llms-full.txt',
    headers: {
      'x-forwarded-host': 'panel.reneo.my.id',
      'x-forwarded-proto': 'https',
      'x-forwarded-prefix': '/app/reneo-crm',
    },
  });
  assert.equal(llmsRes.statusCode, 200);
  assert.match(llmsRes.body, /# Reneo CRM/);
  assert.match(llmsRes.body, /Batas Mulai Sesi/);
  assert.match(llmsRes.body, /Pertanyaan Umum/);

  const landingHtmlRes = await app.inject({
    method: 'GET',
    url: '/api/public/seo/landing',
    headers: {
      'x-forwarded-host': 'panel.reneo.my.id',
      'x-forwarded-proto': 'https',
      'x-forwarded-prefix': '/app/reneo-crm',
    },
  });
  assert.equal(landingHtmlRes.statusCode, 200);
  assert.equal(landingHtmlRes.headers['x-robots-tag'], 'index, follow');
  assert.match(landingHtmlRes.body, /<link rel="canonical" href="https:\/\/panel\.reneo\.my\.id\/app\/reneo-crm\/" \/>/);
  assert.match(landingHtmlRes.body, /application\/ld\+json/);
  assert.match(landingHtmlRes.body, /SoftwareApplication/);
  assert.match(landingHtmlRes.body, /FAQPage/);
  assert.match(landingHtmlRes.body, /<h1>Jangan Biarkan Pembeli Kabur/);
  assert.match(landingHtmlRes.body, /Kenapa Kami Membuat Reneo CRM/);
  assert.equal((landingHtmlRes.body.match(/application\/ld\+json/g) || []).length, 1);

  const landingMdRes = await app.inject({
    method: 'GET',
    url: '/api/public/seo/landing',
    headers: {
      accept: 'text/markdown',
      host: 'crm.toko.example',
    },
  });
  assert.equal(landingMdRes.statusCode, 200);
  assert.match(String(landingMdRes.headers['content-type']), /text\/markdown/);
  assert.match(landingMdRes.body, /# Reneo CRM/);

  await app.close();
});
