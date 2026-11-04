import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Método não permitido." }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const employeeEmail = Deno.env.get("EMPLOYEE_LOGIN_EMAIL");
  const authHeader = req.headers.get("Authorization") || "";
  const callerClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await callerClient.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Não autenticado." }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

  const { data: profile } = await callerClient.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "owner") return new Response(JSON.stringify({ error: "Apenas o administrador pode alterar essa senha." }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });

  const body = await req.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 8) return new Response(JSON.stringify({ error: "A senha deve ter pelo menos 8 caracteres." }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  if (!employeeEmail) return new Response(JSON.stringify({ error: "Configure EMPLOYEE_LOGIN_EMAIL nas variáveis da função." }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });

  const admin = createClient(url, serviceKey);
  const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) return new Response(JSON.stringify({ error: "Não foi possível localizar o login compartilhado." }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  const employee = listed.users.find(u => u.email?.toLowerCase() === employeeEmail.toLowerCase());
  if (!employee) return new Response(JSON.stringify({ error: "Crie primeiro o usuário compartilhado no painel Authentication > Users." }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });

  const { error } = await admin.auth.admin.updateUserById(employee.id, { password });
  if (error) return new Response(JSON.stringify({ error: "Falha ao atualizar a senha." }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
});