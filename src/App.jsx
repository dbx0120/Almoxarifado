import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://fwwhkblwbbofqqbnlxyf.supabase.co', 'sb_publishable_CaY3XZG1OJbSsGmCEMWgvA_e5F_Hzl0');
const locations = ['A1','A2','A3','A4','B1','B2','B3','B4','C1','C2','C3','C4','D1','D2','D3','D4','E1','E2','E3','E4'];

export default function App() {
  const [session, setSession] = useState(null);
  const [role, setRole] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [query, setQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ code: '', name: '', location: 'A1' });
  const [login, setLogin] = useState({ email: '', password: '' });
  const [employeePassword, setEmployeePassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const configured = Boolean(supabase);

  async function loadProfile(user) {
    if (!user) { setRole(null); return; }
    const { data, error } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (error) { setMessage('Não foi possível carregar o perfil. Confira a configuração do banco.'); return; }
    setRole(data.role);
  }
  async function loadMaterials() {
    if (!supabase) return;
    const { data, error } = await supabase.from('materials').select('*').order('name');
    if (error) setMessage('Erro ao carregar materiais: ' + error.message);
    else setMaterials(data || []);
  }
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next);
      if (next?.user) await loadProfile(next.user);
      else setRole(null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => { if (session && role) loadMaterials(); }, [session, role]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR');
    if (!q) return [];
    return materials.filter(m =>
      m.name.toLocaleLowerCase('pt-BR').includes(q) ||
      (m.code || '').toLocaleLowerCase('pt-BR').includes(q)
    );
  }, [materials, query]);

  async function signIn(e) {
    e.preventDefault(); setBusy(true); setMessage('');
    const { error } = await supabase.auth.signInWithPassword({ email: login.email, password: login.password });
    setBusy(false);
    if (error) setMessage('Não foi possível entrar. Confira usuário e senha.');
  }
  async function signOut() { await supabase.auth.signOut(); setMaterials([]); setSelectedLocation(''); }
  function startNew() { setEditing(null); setForm({ code: '', name: '', location: selectedLocation || 'A1' }); }
  function startEdit(m) { setEditing(m.id); setForm({ code: m.code || '', name: m.name, location: m.location }); }
  async function saveMaterial(e) {
    e.preventDefault(); setBusy(true); setMessage('');
    const payload = { code: form.code.trim() || null, name: form.name.trim(), location: form.location };
    const result = editing
      ? await supabase.from('materials').update(payload).eq('id', editing)
      : await supabase.from('materials').insert(payload);
    setBusy(false);
    if (result.error) { setMessage('Erro ao salvar: ' + result.error.message); return; }
    setEditing(null); setForm({ code: '', name: '', location: selectedLocation || 'A1' }); await loadMaterials();
    setMessage('Material salvo.');
  }
  async function deleteMaterial(id) {
    if (!window.confirm('Excluir este material?')) return;
    const { error } = await supabase.from('materials').delete().eq('id', id);
    if (error) setMessage('Erro ao excluir: ' + error.message);
    else { setMessage('Material excluído.'); await loadMaterials(); }
  }
  async function changeEmployeePassword(e) {
    e.preventDefault(); setBusy(true); setMessage('');
    const { data, error } = await supabase.functions.invoke('change-employee-password', { body: { password: employeePassword } });
    setBusy(false);
    if (error || data?.error) { setMessage('Não foi possível alterar a senha compartilhada. ' + (data?.error || error?.message || '')); return; }
    setEmployeePassword(''); setMessage('Senha compartilhada dos funcionários atualizada.');
  }

  if (!configured) return <main className="setup"><div className="login-card"><div className="brand-mark">VF7</div><h1>Almoxarifado VF7</h1><p>O projeto está pronto, mas falta conectar o banco de dados online.</p><p>Preencha o arquivo <code>.env</code> com a URL e a chave pública do seu projeto Supabase, conforme o guia LEIA-ME.</p></div></main>;
  if (!session) return <main className="login-page"><form className="login-card" onSubmit={signIn}><div className="brand-mark">VF7</div><h1>Almoxarifado VF7</h1><p>Entre para consultar as localizações de materiais.</p><label>E-mail de acesso<input type="email" required value={login.email} onChange={e=>setLogin({...login,email:e.target.value})}/></label><label>Senha<input type="password" required value={login.password} onChange={e=>setLogin({...login,password:e.target.value})}/></label><button disabled={busy}>{busy?'Entrando…':'Entrar'}</button>{message && <p className="notice">{message}</p>}</form></main>;

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark small">VF7</div><div><strong>ALMOXARIFADO VF7</strong><span>Consulta de materiais e localizações</span></div></div><div className="user-tools"><span className="role">{role === 'owner' ? 'Administrador' : 'Consulta'}</span><button className="ghost" onClick={signOut}>Sair</button></div></header>
    <main className="content">
      <section className="welcome"><div><p className="eyebrow">LOCALIZE RAPIDAMENTE</p><h1>Onde está o material?</h1><p>Pesquise pelo nome ou pelo código e veja a posição no almoxarifado.</p></div></section>
      {message && <div className="notice">{message}</div>}
      <section className="search-panel"><label htmlFor="global-search">Busca geral</label><input id="global-search" className="search-input" placeholder="Digite o nome ou código do material…" value={query} onChange={e=>setQuery(e.target.value)}/>{query.trim() && <div className="results"><div className="result-count">{filtered.length} resultado(s)</div>{filtered.length ? filtered.map(m=><article className="result" key={m.id}><div><strong>{m.name}</strong><small>{m.code ? `Código: ${m.code}` : 'Sem código cadastrado'}</small></div><span className="location-tag">{m.location}</span>{role==='owner' && <button className="text-button" onClick={()=>startEdit(m)}>Editar</button>}</article>) : <p className="empty">Nenhum material encontrado.</p>}</div>}</section>
      {role === 'owner' && <section className="admin-grid"><div className="panel"><div className="panel-heading"><div><h2>{editing ? 'Editar material' : 'Cadastrar material'}</h2><p>O código é opcional.</p></div></div><form className="material-form" onSubmit={saveMaterial}><label>Nome / descrição<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Ex.: Parafuso sextavado"/></label><label>Código (opcional)<input value={form.code} onChange={e=>setForm({...form,code:e.target.value})} placeholder="Ex.: MAT-001"/></label><label>Localização<select value={form.location} onChange={e=>setForm({...form,location:e.target.value})}>{locations.map(l=><option key={l}>{l}</option>)}</select></label><div className="form-actions"><button disabled={busy}>{busy?'Salvando…':editing?'Salvar alterações':'Cadastrar material'}</button>{editing && <button type="button" className="secondary" onClick={startNew}>Cancelar</button>}</div></form></div><div className="panel"><h2>Acesso dos funcionários</h2><p>Altere a senha do login compartilhada de consulta.</p><form className="material-form" onSubmit={changeEmployeePassword}><label>Nova senha compartilhada<input type="password" minLength="8" required value={employeePassword} onChange={e=>setEmployeePassword(e.target.value)} placeholder="Mínimo de 8 caracteres"/></label><button disabled={busy}>Atualizar senha</button></form><p className="hint">Todos os funcionários usam o mesmo e-mail de acesso configurado no projeto.</p></div></section>}
      <section className="shelves-section"><div className="section-heading"><div><h2>Prateleiras</h2><p>Selecione uma posição para consultar os materiais.</p></div><span className="count-pill">20 posições</span></div><div className="shelf-grid">{['A','B','C','D','E'].map(letter=><div className="shelf-card" key={letter}><div className="shelf-title">PRATELEIRA {letter}</div><div className="levels">{[1,2,3,4].map(n=>{const loc=letter+n;const count=materials.filter(m=>m.location===loc).length;return <button key={loc} className={`level ${selectedLocation===loc?'active':''}`} onClick={()=>setSelectedLocation(selectedLocation===loc?'':loc)}><strong>{loc}</strong><span>{count} material(is)</span></button>})}</div></div>)}</div></section>
      {selectedLocation && <section className="panel location-panel"><div className="panel-heading"><div><h2>Posição {selectedLocation}</h2><p>Materiais cadastrados neste local.</p></div><button className="ghost" onClick={()=>setSelectedLocation('')}>Fechar</button></div>{materials.filter(m=>m.location===selectedLocation).length ? materials.filter(m=>m.location===selectedLocation).map(m=><article className="result" key={m.id}><div><strong>{m.name}</strong><small>{m.code ? `Código: ${m.code}` : 'Sem código cadastrado'}</small></div>{role==='owner' && <div className="row-actions"><button className="text-button" onClick={()=>startEdit(m)}>Editar</button><button className="delete-button" onClick={()=>deleteMaterial(m.id)}>Excluir</button></div>}</article>) : <p className="empty">Nenhum material cadastrado nesta posição.</p>}</section>}
      {role==='owner' && <section className="panel all-materials"><h2>Todos os materiais</h2>{materials.length ? materials.map(m=><article className="result" key={m.id}><div><strong>{m.name}</strong><small>{m.code || 'Sem código'} · Posição {m.location}</small></div><div className="row-actions"><button className="text-button" onClick={()=>startEdit(m)}>Editar</button><button className="delete-button" onClick={()=>
