import { useEffect } from 'react';
import { SITE } from '../siteConfig';

function setTag(selector, create, attrs) {
  let el = document.head.querySelector(selector);
  if (!el) { el = document.createElement(create); document.head.appendChild(el); }
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
}

// Per-page title, description and canonical link (the site is a single-page app, so these are set at runtime).
export default function usePageMeta({ title, description, path }) {
  useEffect(() => {
    document.title = title;
    setTag('meta[name="description"]', 'meta', { name: 'description', content: description });
    setTag('link[rel="canonical"]', 'link', { rel: 'canonical', href: SITE.baseUrl + path });
  }, [title, description, path]);
}
