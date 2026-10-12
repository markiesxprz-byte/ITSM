import React, { useEffect, useState, useCallback } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Button, Field, Input, Textarea, Select, EmptyState, Card } from '../components/ui';
import Modal from '../components/Modal';

export default function KnowledgeBase() {
  const { user } = useAuth();
  const isStaff = user.role === 'admin' || user.role === 'agent';
  const [articles, setArticles] = useState([]);
  const [q, setQ] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = useCallback(() => {
    const params = {};
    if (q) params.q = q;
    client.get('/knowledge', { params }).then((res) => setArticles(res.data));
  }, [q]);

  useEffect(() => { load(); }, [load]);

  function openArticle(id) {
    client.get(`/knowledge/${id}`).then((res) => setSelected(res.data));
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Knowledge Base</h1>
          <p className="text-sm text-ink/50">Self-service articles so people can solve common issues themselves.</p>
        </div>
        {isStaff && <Button className="w-fit" onClick={() => setCreateOpen(true)}>+ New article</Button>}
      </div>

      <div className="mb-4">
        <Input placeholder="Search articles…" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-sm" />
      </div>

      {articles.length === 0 ? (
        <EmptyState title="No articles found" hint="Nothing matches this search, or none have been published yet." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {articles.map((a) => (
            <Card key={a.id} className="cursor-pointer p-5 hover:border-patina-400" onClick={() => openArticle(a.id)}>
              <div className="mb-1 flex items-center justify-between">
                <span className="rounded bg-stone-100 px-2 py-0.5 text-xs capitalize text-ink/60">{a.category}</span>
                {isStaff && a.status !== 'published' && (
                  <span className="text-xs capitalize text-amber-600">{a.status}</span>
                )}
              </div>
              <h3 className="font-display mb-1 font-semibold text-ink">{a.title}</h3>
              <p className="line-clamp-2 text-sm text-ink/60">{a.content}</p>
              <div className="mt-3 text-xs text-ink/40">{a.views} views</div>
            </Card>
          ))}
        </div>
      )}

      {isStaff && (
        <CreateArticleModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); load(); }} />
      )}
      {selected && (
        <ArticleModal article={selected} isStaff={isStaff} onClose={() => setSelected(null)} onChanged={() => { openArticle(selected.id); load(); }} />
      )}
    </div>
  );
}

function CreateArticleModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ title: '', content: '', category: 'general', tags: '' });
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await client.post('/knowledge', form);
      setForm({ title: '', content: '', category: 'general', tags: '' });
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Write a knowledge base article">
      <form onSubmit={submit}>
        <Field label="Title">
          <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Content">
          <Textarea required value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Steps, screenshots (as text), and context that helps someone self-serve" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Category">
            <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="access, hardware, network…" />
          </Field>
          <Field label="Tags" hint="Comma separated">
            <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="password, login" />
          </Field>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Publishing…' : 'Publish article'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function ArticleModal({ article, isStaff, onClose, onChanged }) {
  async function feedback(helpful) {
    await client.post(`/knowledge/${article.id}/feedback`, { helpful });
    onChanged();
  }

  return (
    <Modal open onClose={onClose} title={article.title} width="max-w-2xl">
      <div className="mb-4 flex items-center gap-3 text-xs text-ink/40">
        <span className="rounded bg-stone-100 px-2 py-0.5 capitalize">{article.category}</span>
        <span>{article.views} views</span>
      </div>
      <p className="mb-6 whitespace-pre-wrap text-sm leading-relaxed text-ink/80">{article.content}</p>

      <div className="flex items-center justify-between border-t border-stone-100 pt-4">
        <span className="text-sm text-ink/50">Was this helpful?</span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => feedback(true)}>👍 Yes ({article.helpful_count})</Button>
          <Button variant="secondary" onClick={() => feedback(false)}>👎 No ({article.not_helpful_count})</Button>
        </div>
      </div>
    </Modal>
  );
}
