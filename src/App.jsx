import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://fwwhkblwbbofqqbnlxyf.supabase.co', 'sb_publishable_Ineuvy4wWWqSEsbg8RRG4A_S_9cRvlH');
const locations = ['A1','A2','A3','A4','B1','B2','B3','B4','C1','C2','C3','C4','D1','D2','D3','D4','E1','E2','E3','E4'];

export default function App() {
  const [session, setSession] = useState(null);
  const [role, setRole] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loans, setLoans] = useState([]);
  const [inventoryLog, setInventoryLog] = useState(null);
  const [query, setQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [activeTab, setActiveTab] = useState('inventory'); // 'inventory', 'loans', 'reports', 'inventory_check', 'employees'
  const [loanFilter, setLoanFilter] = useState('all'); // 'all', 'pending', 'returned'
  const [theme, setTheme] = useState('light'); // 'light', 'dark'
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ code: '', name: '', location: 'A1', quantity: 1 });
  const [employeeName, setEmployeeName] = useState('');
  const [loanForm, setLoanForm] = useState({ material_id: '', employee_id: '', quantity: 1 });
  const [login, setLogin] = useState({ email: '', password: '' });
  const [employeePassword, setEmployeePassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const configured = Boolean(supabase);

  async function loadProfile(user) {
    if (!user) { setRole(null); return; }
    const { data, error } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (error) { setMessage('Não foi possível carregar o perfil.'); return; }
    setRole(data.role);
  }

  async function loadData() {
    if (!supabase) return;
    const [matRes, empRes, loanRes, invRes] = await Promise.all([
      supabase.from('materials').select('*').order('name'),
      supabase.from('employees').select('*').order('name'),
      supabase.from('loans').select('*, materials(name, location), employees(name)').order('borrowed_at', { ascending: false }),
      supabase.from('inventory_audit').select('*').order('checked_at', { ascending: false }).limit(1)
    ]);
    if (matRes.error) setMessage('Erro ao carregar materiais: ' + matRes.error.message);
    else setMaterials(matRes.data || []);
    if (!empRes.error) setEmployees(empRes.data || []);
    if (!loanRes.error) setLoans(loanRes.data || []);
    if (!invRes.error && invRes.data?.length) setInventoryLog(invRes.data[0]);
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

  useEffect(() => { if (session && role) loadData(); }, [session, role]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR');
    if (!q) return [];
    return materials.filter(m =>
      m.name.toLocaleLowerCase('pt-BR').includes(q) ||
      (m.code || '').toLocaleLowerCase('pt-BR').includes(q)
    );
  }, [materials, query]);

  const filteredLoans = useMemo(() => {
    if (loanFilter === 'pending') return loans.filter(l => !l.returned);
    if (loanFilter === 'returned') return loans.filter(l => l.returned);
    return loans;
  }, [loans, loanFilter]);

  const employeeRanking = useMemo(() => {
    const stats = {};
    employees.forEach(emp => {
      stats[emp.id] = { name: emp.name, totalLoans: 0, pendingLoans: 0 };
    });
    loans.forEach(l => {
      if (stats[l.employee_id]) {
        stats[l.employee_id].totalLoans += 1;
        if (!l.returned) {
          stats[l.employee_id].pendingLoans += 1;
        }
      }
    });
    return Object.values(stats).sort((a, b) => b.pendingLoans - a.pendingLoans || b.totalLoans - a.totalLoans);
  }, [employees, loans]);

  async function signIn(e) {
    e.preventDefault(); setBusy(true); setMessage('');
    const { error } = await supabase.auth.signInWithPassword({ email: login.email, password: login.password });
    setBusy(false);
    if (error) setMessage('Não foi possível entrar. Confira e-mail e senha.');
  }

  async function signOut() { await supabase.auth.signOut(); setMaterials([]); setSelectedLocation(''); }
  function startNew() { setEditing(null); setForm({ code: '', name: '', location: selectedLocation || 'A1', quantity: 1 }); }
  function startEdit(m) { setEditing(m.id); setForm({ code: m.code || '', name: m.name, location: m.location, quantity: m.quantity || 1 }); }

  async function saveMaterial(e) {
    e.preventDefault(); setBusy(true); setMessage('');
    const payload = { code: form.code.trim() || null, name: form.name.trim(), location: form.location, quantity: Number(form.quantity) || 1 };
    const result = editing
      ? await supabase.from('materials').update(payload).eq('id', editing)
      : await supabase.from('materials').insert(payload);
    setBusy(false);
    if (result.error) { setMessage('Erro ao salvar: ' + result.error.message); return; }
    setEditing(null); setForm({ code: '', name: '', location: selectedLocation || 'A1', quantity: 1 }); await loadData();
    setMessage('Material salvo com sucesso.');
  }

  async function deleteMaterial(id) {
    if (!window.confirm('Deseja realmente excluir este material?')) return;
    const { error } = await supabase.from('materials').delete().eq('id', id);
    if (error) setMessage('Erro ao excluir: ' + error.message);
    else { setMessage('Material excluído.'); await loadData(); }
  }

  async function addEmployee(e) {
    e.preventDefault();
    if (!employeeName.trim()) return;
    setBusy(true);
    const { error } = await supabase.from('employees').insert({ name: employeeName.trim() });
    setBusy(false);
    if (error) setMessage('Erro ao adicionar funcionário: ' + error.message);
    else { setEmployeeName(''); setMessage('Funcionário cadastrado.'); await loadData(); }
  }

  async function deleteEmployee(id) {
    if (!window.confirm('Deseja remover este funcionário?')) return;
    const { error } = await supabase.from('employees').delete().eq('id', id);
    if (error) setMessage('Erro ao excluir: ' + error.message);
    else { setMessage('Funcionário removido.'); await loadData(); }
  }

  async function registerLoan(e) {
    e.preventDefault();
    if (!loanForm.material_id || !loanForm.employee_id) return;
    setBusy(true);
    const { error } = await supabase.from('loans').insert({
      material_id: loanForm.material_id,
      employee_id: loanForm.employee_id,
      quantity: Number(loanForm.quantity) || 1,
      returned: false
    });
    setBusy(false);
    if (error) setMessage('Erro ao registrar retirada: ' + error.message);
    else { setLoanForm({ material_id: '', employee_id: '', quantity: 1 }); setMessage('Retirada registrada com sucesso.'); await loadData(); }
  }

  async function toggleReturn(loanId, currentStatus) {
    const { error } = await supabase.from('loans').update({
      returned: !currentStatus,
      returned_at: !currentStatus ? new Date().toISOString() : null
    }).eq('id', loanId);
    if (error) setMessage('Erro ao atualizar status: ' + error.message);
    else await loadData();
  }

  async function deleteLoan(loanId) {
    if (!window.confirm('Deseja realmente excluir este registro de requisição?')) return;
    const { error } = await supabase.from('loans').delete().eq('id', loanId);
    if (error) setMessage('Erro ao excluir requisição: ' + error.message);
    else { setMessage('Requisição excluída.'); await loadData(); }
  }

  async function performInventoryCheck() {
    setBusy(true); setMessage('');
    // Cria a tabela caso não exista logicamente na primeira execução, e registra a auditoria
    const { error } = await supabase.from('inventory_audit').insert({
      checked_by: session?.user?.email || 'Administrador',
      checked_at: new Date().toISOString()
    });
    setBusy(false);
    if (error) {
      // Se a tabela inventory_audit não existir no Supabase ainda, avisa de forma amigável
      setMessage('Erro ao registrar inventário. Certifique-se de criar a tabela inventory_audit no Supabase.');
      return;
    }
    setMessage('Inventário geral registrado com sucesso!');
    await loadData();
  }

  async function changeEmployeePassword(e) {
    e.preventDefault(); setBusy(true); setMessage('');
    const { data, error } = await supabase.functions.invoke('change-employee-password', { body: { password: employeePassword } });
    setBusy(false);
    if (error || data?.error) { setMessage('Não foi possível alterar a senha. ' + (data?.error || error?.message || '')); return; }
    setEmployeePassword(''); setMessage('Senha compartilhada atualizada com sucesso.');
  }

  // Estilos dinâmicos baseados no Tema Claro/Escuro
  const isDark = theme === 'dark';
  const themeStyles = {
    bg: isDark ? '#0f172a' : '#f8fafc',
    cardBg: isDark ? '#1e293b' : '#ffffff',
    text: isDark ? '#f8fafc' : '#0f172a',
    subText: isDark ? '#94a3b8' : '#64748b',
    border: isDark ? '#334155' : '#e2e8f0',
    navBg: isDark ? '#1e293b' : '#ffffff',
    inputBg: isDark ? '#0f172a' : '#ffffff',
    inputText: isDark ? '#f8fafc' : '#0f172a'
  };

  if (!configured) return <main className="setup"><div className="login-card"><div className="brand-mark">VF7</div><h1>Almoxarifado VF7</h1><p>Conecte o Supabase para começar.</p></div></main>;
  if (!session) return <main className="login-page"><form className="login-card" onSubmit={signIn}><div className="brand-mark">VF7</div><h1>Almoxarifado VF7</h1><p>Entre para acessar o almoxarifado.</p><label>E-mail<input type="email" required value={login.email} onChange={e=>setLogin({...login,email:e.target.value})}/></label><label>Senha<input type="password" required value={login.password} onChange={e=>setLogin({...login,password:e.target.value})}/></label><button disabled={busy}>{busy?'Entrando…':'Entrar'}</button>{message && <p className="notice">{message}</p>}</form></main>;

  return <div className="app-shell" style={{ background: themeStyles.bg, color: themeStyles.text, minHeight: '100vh', transition: 'background 0.3s ease' }}>
    <header className="topbar" style={{ background: themeStyles.cardBg, borderBottom: `1px solid ${themeStyles.border}` }}>
      <div className="brand"><div className="brand-mark small">VF7</div><div><strong>ALMOXARIFADO VF7</strong><span style={{ color: themeStyles.subText }}>Controle de Materiais e Requisições</span></div></div>
      <div className="user-tools" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        {/* Botão de Sol / Lua */}
        <button onClick={()=>setTheme(isDark ? 'light' : 'dark')} title="Alternar Modo Claro / Escuro" style={{ background: 'none', border: `1px solid ${themeStyles.border}`, borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
          {isDark ? '☀️' : '🌙'}
        </button>
        <span className="role" style={{ color: themeStyles.text }}>{role === 'owner' ? 'Administrador' : 'Consulta'}</span>
        <button className="ghost" onClick={signOut}>Sair</button>
      </div>
    </header>

    <nav className="tabs-nav" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', padding: '15px 20px', background: themeStyles.navBg, borderBottom: `1px solid ${themeStyles.border}` }}>
      <button className={`tab-btn ${activeTab === 'inventory' ? 'active' : ''}`} onClick={()=>setActiveTab('inventory')} style={{ padding: '8px 16px', fontWeight: 'bold', cursor: 'pointer', background: activeTab === 'inventory' ? '#2563eb' : themeStyles.cardBg, color: activeTab === 'inventory' ? '#fff' : themeStyles.text, border: `1px solid ${themeStyles.border}`, borderRadius: '6px' }}>📦 Estoque & Prateleiras</button>
      <button className={`tab-btn ${activeTab === 'loans' ? 'active' : ''}`} onClick={()=>setActiveTab('loans')} style={{ padding: '8px 16px', fontWeight: 'bold', cursor: 'pointer', background: activeTab === 'loans' ? '#2563eb' : themeStyles.cardBg, color: activeTab === 'loans' ? '#fff' : themeStyles.text, border: `1px solid ${themeStyles.border}`, borderRadius: '6px' }}>🔄 Requisições</button>
      <button className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`} onClick={()=>setActiveTab('reports')} style={{ padding: '8px 16px', fontWeight: 'bold', cursor: 'pointer', background: activeTab === 'reports' ? '#2563eb' : themeStyles.cardBg, color: activeTab === 'reports' ? '#fff' : themeStyles.text, border: `1px solid ${themeStyles.border}`, borderRadius: '6px' }}>📊 Relatório & Ranking</button>
      <button className={`tab-btn ${activeTab === 'inventory_check' ? 'active' : ''}`} onClick={()=>setActiveTab('inventory_check')} style={{ padding: '8px 16px', fontWeight: 'bold', cursor: 'pointer', background: activeTab === 'inventory_check' ? '#2563eb' : themeStyles.cardBg, color: activeTab === 'inventory_check' ? '#fff' : themeStyles.text, border: `1px solid ${themeStyles.border}`, borderRadius: '6px' }}>📋 Inventário Semanal</button>
      {role === 'owner' && <button className={`tab-btn ${activeTab === 'employees' ? 'active' : ''}`} onClick={()=>setActiveTab('employees')} style={{ padding: '8px 16px', fontWeight: 'bold', cursor: 'pointer', background: activeTab === 'employees' ? '#2563eb' : themeStyles.cardBg, color: activeTab === 'employees' ? '#fff' : themeStyles.text, border: `1px solid ${themeStyles.border}`, borderRadius: '6px' }}>👥 Funcionários</button>}
    </nav>

    <main className="content" style={{ padding: '20px' }}>
      {message && <div className="notice" style={{ marginBottom: '15px', padding: '10px', background: isDark ? '#1e293b' : '#eff6ff', border: `1px solid ${isDark ? '#334155' : '#bfdbfe'}`, borderRadius: '6px', color: themeStyles.text }}>{message}</div>}

      {activeTab === 'inventory' && <>
        <section className="welcome"><div><p className="eyebrow" style={{ color: '#3b82f6' }}>LOCALIZE RÁPIDO</p><h1>Onde está o material?</h1><p style={{ color: themeStyles.subText }}>Consulte a quantidade e a posição exata no almoxarifado.</p></div></section>
        
        <section className="search-panel" style={{ background: themeStyles.cardBg, border: `1px solid ${themeStyles.border}`, padding: '20px', borderRadius: '8px' }}><label htmlFor="global-search" style={{ color: themeStyles.text }}>Busca geral</label><input id="global-search" className="search-input" placeholder="Digite o nome ou código do material…" value={query} onChange={e=>setQuery(e.target.value)} style={{ background: themeStyles.inputBg, color: themeStyles.inputText, border: `1px solid ${themeStyles.border}` }}/>{query.trim() && <div className="results"><div className="result-count" style={{ color: themeStyles.subText }}>{filtered.length} resultado(s)</div>{filtered.length ? filtered.map(m=><article className="result" key={m.id} style={{ borderBottom: `1px solid ${themeStyles.border}` }}><div><strong style={{ color: themeStyles.text }}>{m.name}</strong><small style={{ color: themeStyles.subText }}>{m.code ? `Código: ${m.code}` : 'Sem código'} · Qtd: <strong style={{ color: themeStyles.text }}>{m.quantity}</strong></small></div><span className="location-tag">{m.location}</span>{role==='owner' && <button className="text-button" onClick={()=>startEdit(m)}>Editar</button>}</article>) : <p className="empty" style={{ color: themeStyles.subText }}>Nenhum material encontrado.</p>}</div>}</section>

        {role === 'owner' && <section className="admin-grid"><div className="panel" style={{ background: themeStyles.cardBg, border: `1px solid ${themeStyles.border}` }}><div className="panel-heading"><h2 style={{ color: themeStyles.text }}>{editing ? 'Editar material' : 'Cadastrar material'}</h2></div><form className="material-form" onSubmit={saveMaterial}><label style={{ color: themeStyles.text }}>Nome / descrição<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Ex.: Parafuso sextavado" style={{ background: themeStyles.inputBg, color: themeStyles.inputText, border: `1px solid ${themeStyles.border}` }}/></label><label style={{ color: themeStyles.text }}>Código (opcional)<input value={form.code} onChange={e=>setForm({...form,code:e.target.value})} placeholder="Ex.: MAT-001" style={{ background: themeStyles.inputBg, color: themeStyles.inputText, border: `1px solid ${themeStyles.border}` }}/></label><label style={{ color: themeStyles.text }}>Quantidade<input type="number" min="1" required value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})} style={{ background: themeStyles.inputBg, color: themeStyles.inputText, border: `1px solid ${themeStyles.border}` }}/></label><label style={{ color: themeStyles.text }}>Localização<select value={form.location} onChange={e=>setForm({...form,location:e.target.value})} style={{ background: themeStyles.inputBg, color: themeStyles.inputText, border: `1px solid ${themeStyles.border}` }}>{locations.map(l=><option key={l}>{l}</option>)}</select></label><div className="form-actions"><button disabled={busy}>{busy?'Salvando…':editing?'Salvar alterações':'Cadastrar material'}</button>{editing && <button type="button" className="secondary" onClick={startNew}>Cancelar</button>}</div></form></div><div className="panel" style={{ background: themeStyles.cardBg, border: `1px solid ${themeStyles.border}` }}><h2 style={{ color: themeStyles.text }}>Senha dos Funcionários</h2><form className="material-form" onSubmit={changeEmployeePassword}><label style={{ color: themeStyles.text }}>Nova senha compartilhada<input type="password" minLength="8" required value={employeePassword} onChange={e=>setEmployeePassword(e.target.value)} placeholder="Mínimo de 8 caracteres" style={{ background: themeStyles.inputBg, color: themeStyles.inputText, border: `1px solid ${themeStyles.border}` }}/></label><button disabled={busy}>Atualizar Senha</button></form></div></section>}

        <section className="shelves-section"><div className="section-heading"><div><h2 style={{ color: themeStyles.text }}>Prateleiras</h2><p style={{ color: themeStyles.subText }}>Selecione uma posição.</p></div><span className="count-pill">20 posições</span></div><div className="shelf-grid">{['A','B','C','D','E'].map(letter=><div className="shelf-card" key={letter} style={{ background: themeStyles.cardBg, border: `1px solid ${themeStyles.border}` }}><div className="shelf-title" style={{ color: themeStyles.text }}>PRATELEIRA {letter}</div><div className="levels">{[1,2,3,4].map(n=>{const loc=letter+n;const count=materials.filter(m=>m.location===loc).length;return <button key={loc} className={`level ${selectedLocation===loc?'active':''}`} onClick={()=>setSelectedLocation(selectedLocation===loc?'':loc)} style={{ background: selectedLocation===loc ? '#2563eb' : themeStyles.inputBg, color: selectedLocation===loc ? '#fff' : themeStyles.text, border: `1px solid ${themeStyles.border}` }}><strong>{loc}</strong><span style={{ color: selectedLocation===loc ? '#e0e7ff' : themeStyles.subText }}>{count} tipo(s)</span></button>})}</div></div>)}</div></section>

        {selectedLocation && <section className="panel location-panel" style={{ background: themeStyles.cardBg, border: `1px solid ${themeStyles.border}` }}><div className="panel-heading"><div style={{ color: themeStyles.text }}><h2>Posição {selectedLocation}</h2></div><button className="ghost" onClick={()=>setSelectedLocation('')}>Fechar</button></div>{materials.filter(m=>m.location===selectedLocation).length ? materials.filter(m=>m.location===selectedLocation).map(m=><article className="result" key={m.id} style={{ borderBottom: `1px solid ${themeStyles.border}` }}><div><strong style={{ color: themeStyles.text }}>{m.name}</strong><small style={{ color: themeStyles.subText }}>Qtd em estoque: {m.quantity} {m.code ? `· Cód: ${m.code}` : ''}</small></div>{role==='owner' && <div className="row-actions"><button className="text-button" onClick={()=>startEdit(m)}>Editar</button><button className="delete-button" onClick={()=>deleteMaterial(m.id)}>Excluir</button></div>}</article>) : <p className="empty" style={{ color: themeStyles.subText }}>Nenhum material cadastrado nesta posição.</p>}</section>}
      </>}

      {activeTab === 'loans' && <div className="panel" style={{ background: themeStyles.cardBg, border: `1px solid ${themeStyles.border}`, padding: '20px', borderRadius: '8px' }}>
        <h2 style={{ color: themeStyles.text }}>Registrar Nova Requisição</h2>
        <p style={{ color: themeStyles.subText }}>Selecione o funcionário e o material para registrar quem retirou.</p>
        <form onSubmit={registerLoan} className="material-form" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px auto', gap: '10px', alignItems: 'end', marginBottom: '25px' }}>
          <label style={{ color: themeStyles.text }}>Funcionário<select required value={loanForm.employee_id} onChange={e=>setLoanForm({...loanForm, employee_id: e.target.value})} style={{ background: themeStyles.inputBg, color: themeStyles.
