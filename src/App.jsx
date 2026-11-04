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
  const [query, setQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [activeTab, setActiveTab] = useState('inventory'); // 'inventory', 'loans', 'employees', 'reports'
  const [loanFilter, setLoanFilter] = useState('all'); // 'all', 'pending', 'returned'
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
    const [matRes, empRes, loanRes] = await Promise.all([
      supabase.from('materials').select('*').order('name'),
      supabase.from('employees').select('*').order('name'),
      supabase.from('loans').select('*, materials(name, location), employees(name)').order('borrowed_at', { ascending: false })
    ]);
    if (matRes.error) setMessage('Erro ao carregar materiais: ' + matRes.error.message);
    else setMaterials(matRes.data || []);
    if (!empRes.error) setEmployees(empRes.data || []);
    if (!loanRes.error) setLoans(loanRes.data || []);
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

  // Filtragem das requisições (Todas, Apenas Pendentes ou Apenas Devolvidas)
  const filteredLoans = useMemo(() => {
    if (loanFilter === 'pending') return loans.filter(l => !l.returned);
    if (loanFilter === 'returned') return loans.filter(l => l.returned);
    return loans;
  }, [loans, loanFilter]);

  // Cálculo para o ranking de funcionários baseado nas requisições
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

  async function changeEmployeePassword(e) {
    e.preventDefault(); setBusy(true); setMessage('');
    const { data, error } = await supabase.functions.invoke('change-employee-password', { body: { password: employeePassword } });
    setBusy(false);
    if (error || data?.error) { setMessage('Não foi possível alterar a senha. ' + (data?.error || error?.message || '')); return; }
    setEmployeePassword(''); setMessage('Senha compartilhada atualizada com sucesso.');
  }

  if (!configured) return <main className="setup"><div className="login-card"><div className="brand-mark">VF7</div><h1>Almoxarifado VF7</h1><p>Conecte o Supabase para começar.</p></div></main>;
  if (!session) return <main className="login-page"><form className="login-card" onSubmit={signIn}><div className="brand-mark">VF7</div><h1>Almoxarifado VF7</h1><p>Entre para acessar o almoxarifado.</p><label>E-mail<input type="email" required value={login.email} onChange={e=>setLogin({...login,email:e.target.value})}/></label><label>Senha<input type="password" required value={login.password} onChange={e=>setLogin({...login,password:e.target.value})}/></label><button disabled={busy}>{busy?'Entrando…':'Entrar'}</button>{message && <p className="notice">{message}</p>}</form></main>;

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark small">VF7</div><div><strong>ALMOXARIFADO VF7</strong><span>Controle de Materiais e Requisições</span></div></div>
      <div className="user-tools">
        <span className="role">{role === 'owner' ? 'Administrador' : 'Consulta'}</span>
        <button className="ghost" onClick={signOut}>Sair</button>
      </div>
    </header>

    <nav className="tabs-nav" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', padding: '15px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
      <button className={`tab-btn ${activeTab === 'inventory' ? 'active' : ''}`} onClick={()=>setActiveTab('inventory')} style={{ padding: '8px 16px', fontWeight: 'bold', cursor: 'pointer', background: activeTab === 'inventory' ? '#2563eb' : '#fff', color: activeTab === 'inventory' ? '#fff' : '#334155', border: '1px solid #cbd5e1', borderRadius: '6px' }}>📦 Estoque & Prateleiras</button>
      <button className={`tab-btn ${activeTab === 'loans' ? 'active' : ''}`} onClick={()=>setActiveTab('loans')} style={{ padding: '8px 16px', fontWeight: 'bold', cursor: 'pointer', background: activeTab === 'loans' ? '#2563eb' : '#fff', color: activeTab === 'loans' ? '#fff' : '#334155', border: '1px solid #cbd5e1', borderRadius: '6px' }}>🔄 Requisições</button>
      <button className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`} onClick={()=>setActiveTab('reports')} style={{ padding: '8px 16px', fontWeight: 'bold', cursor: 'pointer', background: activeTab === 'reports' ? '#2563eb' : '#fff', color: activeTab === 'reports' ? '#fff' : '#334155', border: '1px solid #cbd5e1', borderRadius: '6px' }}>📊 Relatório & Ranking</button>
      {role === 'owner' && <button className={`tab-btn ${activeTab === 'employees' ? 'active' : ''}`} onClick={()=>setActiveTab('employees')} style={{ padding: '8px 16px', fontWeight: 'bold', cursor: 'pointer', background: activeTab === 'employees' ? '#2563eb' : '#fff', color: activeTab === 'employees' ? '#fff' : '#334155', border: '1px solid #cbd5e1', borderRadius: '6px' }}>👥 Funcionários</button>}
    </nav>

    <main className="content">
      {message && <div className="notice" style={{ marginBottom: '15px', padding: '10px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px' }}>{message}</div>}

      {activeTab === 'inventory' && <>
        <section className="welcome"><div><p className="eyebrow">LOCALIZE RÁPIDO</p><h1>Onde está o material?</h1><p>Consulte a quantidade e a posição exata no almoxarifado.</p></div></section>
        
        <section className="search-panel"><label htmlFor="global-search">Busca geral</label><input id="global-search" className="search-input" placeholder="Digite o nome ou código do material…" value={query} onChange={e=>setQuery(e.target.value)}/>{query.trim() && <div className="results"><div className="result-count">{filtered.length} resultado(s)</div>{filtered.length ? filtered.map(m=><article className="result" key={m.id}><div><strong>{m.name}</strong><small>{m.code ? `Código: ${m.code}` : 'Sem código'} · Qtd: <strong>{m.quantity}</strong></small></div><span className="location-tag">{m.location}</span>{role==='owner' && <button className="text-button" onClick={()=>startEdit(m)}>Editar</button>}</article>) : <p className="empty">Nenhum material encontrado.</p>}</div>}</section>

        {role === 'owner' && <section className="admin-grid"><div className="panel"><div className="panel-heading"><h2>{editing ? 'Editar material' : 'Cadastrar material'}</h2></div><form className="material-form" onSubmit={saveMaterial}><label>Nome / descrição<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Ex.: Parafuso sextavado"/></label><label>Código (opcional)<input value={form.code} onChange={e=>setForm({...form,code:e.target.value})} placeholder="Ex.: MAT-001"/></label><label>Quantidade<input type="number" min="1" required value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/></label><label>Localização<select value={form.location} onChange={e=>setForm({...form,location:e.target.value})}>{locations.map(l=><option key={l}>{l}</option>)}</select></label><div className="form-actions"><button disabled={busy}>{busy?'Salvando…':editing?'Salvar alterações':'Cadastrar material'}</button>{editing && <button type="button" className="secondary" onClick={startNew}>Cancelar</button>}</div></form></div><div className="panel"><h2>Senha dos Funcionários</h2><form className="material-form" onSubmit={changeEmployeePassword}><label>Nova senha compartilhada<input type="password" minLength="8" required value={employeePassword} onChange={e=>setEmployeePassword(e.target.value)} placeholder="Mínimo de 8 caracteres"/></label><button disabled={busy}>Atualizar Senha</button></form></div></section>}

        <section className="shelves-section"><div className="section-heading"><div><h2>Prateleiras</h2><p>Selecione uma posição.</p></div><span className="count-pill">20 posições</span></div><div className="shelf-grid">{['A','B','C','D','E'].map(letter=><div className="shelf-card" key={letter}><div className="shelf-title">PRATELEIRA {letter}</div><div className="levels">{[1,2,3,4].map(n=>{const loc=letter+n;const count=materials.filter(m=>m.location===loc).length;return <button key={loc} className={`level ${selectedLocation===loc?'active':''}`} onClick={()=>setSelectedLocation(selectedLocation===loc?'':loc)}><strong>{loc}</strong><span>{count} tipo(s)</span></button>})}</div></div>)}</div></section>

        {selectedLocation && <section className="panel location-panel"><div className="panel-heading"><div><h2>Posição {selectedLocation}</h2></div><button className="ghost" onClick={()=>setSelectedLocation('')}>Fechar</button></div>{materials.filter(m=>m.location===selectedLocation).length ? materials.filter(m=>m.location===selectedLocation).map(m=><article className="result" key={m.id}><div><strong>{m.name}</strong><small>Qtd em estoque: {m.quantity} {m.code ? `· Cód: ${m.code}` : ''}</small></div>{role==='owner' && <div className="row-actions"><button className="text-button" onClick={()=>startEdit(m)}>Editar</button><button className="delete-button" onClick={()=>deleteMaterial(m.id)}>Excluir</button></div>}</article>) : <p className="empty">Nenhum material cadastrado nesta posição.</p>}</section>}
      </>}

      {activeTab === 'loans' && <div className="panel" style={{ background: '#fff', padding: '20px', borderRadius: '8px' }}>
        <h2>Registrar Nova Requisição</h2>
        <p>Selecione o funcionário e o material para registrar quem retirou.</p>
        <form onSubmit={registerLoan} className="material-form" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px auto', gap: '10px', alignItems: 'end', marginBottom: '25px' }}>
          <label>Funcionário<select required value={loanForm.employee_id} onChange={e=>setLoanForm({...loanForm, employee_id: e.target.value})}><option value="">Selecione o funcionário...</option>{employees.map(emp=>(<option key={emp.id} value={emp.id}>{emp.name}</option>))}</select></label>
          <label>Material<select required value={loanForm.material_id} onChange={e=>setLoanForm({...loanForm, material_id: e.target.value})}><option value="">Selecione o material...</option>{materials.map(mat=>(<option key={mat.id} value={mat.id}>{mat.name} (Disp: {mat.quantity})</option>))}</select></label>
          <label>Quantidade<input type="number" min="1" required value={loanForm.quantity} onChange={e=>setLoanForm({...loanForm, quantity: e.target.value})}/></label>
          <button disabled={busy} style={{ height: '42px' }}>Registrar Retirada</button>
        </form>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
          <h2>Histórico de Requisições e Devoluções</h2>
          {/* Botões de Filtro Rápido */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={()=>setLoanFilter('all')} style={{ padding: '6px 12px', cursor: 'pointer', background: loanFilter === 'all' ? '#2563eb' : '#f1f5f9', color: loanFilter === 'all' ? '#fff' : '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold' }}>Todos</button>
            <button type="button" onClick={()=>setLoanFilter('pending')} style={{ padding: '6px 12px', cursor: 'pointer', background: loanFilter === 'pending' ? '#dc2626' : '#f1f5f9', color: loanFilter === 'pending' ? '#fff' : '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold' }}>⚠️ Apenas Pendentes</button>
            <button type="button" onClick={()=>setLoanFilter('returned')} style={{ padding: '6px 12px', cursor: 'pointer', background: loanFilter === 'returned' ? '#166534' : '#f1f5f9', color: loanFilter === 'returned' ? '#fff' : '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold' }}>✓ Apenas Devolvidos</button>
          </div>
        </div>

        <div className="results">
          {filteredLoans.length ? filteredLoans.map(l => (
            <article className="result" key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', borderBottom: '1px solid #eee' }}>
              <div>
                <strong>{l.employees?.name || 'Funcionário'}</strong> retirou <strong>{l.quantity}x {l.materials?.name || 'Material'}</strong>
                <br/><small>Data: {new Date(l.borrowed_at).toLocaleString('pt-BR')} {l.materials?.location ? `· Posição: ${l.materials.location}` : ''}</small>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ padding: '4px 10px', borderRadius: '4px', background: l.returned ? '#dcfce7' : '#fee2e2', color: l.returned ? '#166534' : '#991b1b', fontWeight: 'bold', fontSize: '12px' }}>
                  {l.returned ? 'Devolvido ✓' : 'Com o funcionário ⏳'}
                </span>
                <button className="secondary" onClick={()=>toggleReturn(l.id, l.returned)} style={{ padding: '6px 12px', cursor: 'pointer' }}>
                  {l.returned ? 'Marcar como não devolvido' : 'Marcar como Devolvido'}
                </button>
                <button className="delete-button" onClick={()=>deleteLoan(l.id)} title="Excluir requisição" style={{ padding: '6px 10px', cursor: 'pointer' }}>🗑️</button>
              </div>
            </article>
          )) : <p className="empty">Nenhuma requisição encontrada com este filtro.</p>}
        </div>
      </div>}

      {activeTab === 'reports' && <div className="panel" style={{ background: '#fff', padding: '20px', borderRadius: '8px' }}>
        <h2>📊 Ranking de Pendências por Funcionário</h2>
        <p>Veja abaixo quais colaboradores possuem mais materiais pendentes de devolução ou retiradas acumuladas.</p>
        
        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {employeeRanking.length ? employeeRanking.map(item => {
            const maxVal = Math.max(...employeeRanking.map(i => i.totalLoans || 1), 1);
            const pendingPercent = (item.pendingLoans / maxVal) * 100;
            const totalPercent = (item.totalLoans / maxVal) * 100;

            return (
              <div key={
