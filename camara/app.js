/* Protocolo QR da Câmara — lado da Câmara (login + banco Supabase) */
const C = window.CONFIG || {};
let sb = null;

if(C.NOME_CAMARA){ $("h-org").textContent = C.NOME_CAMARA; document.title = "Protocolo · " + C.NOME_CAMARA; }
preencherTipos($("c-tipo"));

function tela(qual){
  for(const t of ["config","carregando","login"]) $("tela-"+t).hidden = t !== qual;
  $("app").hidden = qual !== "app";
  $("user-box").hidden = qual !== "app";
}

/* ---------- Início ---------- */
if(!/^https:\/\//.test(C.SUPABASE_URL||"")){
  tela("config");
}else{
  quandoPronto(() => window.supabase && window.QRCode, erro => {
    if(erro || !window.supabase){
      $("tela-carregando").textContent = "Não foi possível carregar o sistema. Verifique a internet e recarregue a página (F5).";
      return;
    }
    sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
    sb.auth.onAuthStateChange((evento, sessao) => {
      if(sessao) entrou(sessao); else tela("login");
    });
  });
}

/* ---------- Login ---------- */
let usuarioAtual = null;
function entrou(sessao){
  const novo = usuarioAtual !== sessao.user.id;
  usuarioAtual = sessao.user.id;
  $("user-email").textContent = sessao.user.email;
  if(!$("app").hidden && !novo) return;
  tela("app");
  if(!$("c-rec").value) $("c-rec").value = lembrar.get("nome");
  ir("receber");
  setProc("PREFEITURA");
}
$("f-login").addEventListener("submit", async e => {
  e.preventDefault();
  const b = $("b-entrar"); b.disabled = true; b.textContent = "Entrando…"; $("l-status").hidden = true;
  const {error} = await sb.auth.signInWithPassword({email:$("l-email").value.trim(), password:$("l-senha").value});
  b.disabled = false; b.textContent = "Entrar";
  if(error){
    $("l-status").hidden = false;
    const m = error.message || "";
    $("l-status").textContent =
      (error.code === "invalid_credentials" || /invalid login credentials/i.test(m)) ? "E-mail ou senha incorretos." :
      /api key/i.test(m) ? "Chave do Supabase inválida: confira SUPABASE_URL e SUPABASE_ANON_KEY no assets/config.js." :
      /email not confirmed/i.test(m) ? "Usuário ainda não confirmado: no Supabase, confirme o usuário em Authentication → Users." :
      /fetch|network/i.test(m) ? "Não foi possível falar com o Supabase: confira a SUPABASE_URL no assets/config.js." :
      "Não foi possível entrar: " + m;
  }else{
    $("l-senha").value = "";
  }
});
$("b-sair").addEventListener("click", async () => { usuarioAtual = null; await sb.auth.signOut(); });

function erroAmigavel(error){
  const m = (error && (error.message || String(error))) || "erro desconhecido";
  if(/JWT|token|not authenticated|login/i.test(m)) return "Sua sessão expirou. Saia e entre de novo.";
  if(/fetch|network|Failed/i.test(m)) return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
  return m;
}

/* ---------- Data e hora (sempre no horário de Brasília) ---------- */
const partesSP = iso => Object.fromEntries(new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",
  year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"})
  .formatToParts(new Date(iso)).map(p => [p.type, p.value]));
const fmtQuando = iso => { const p = partesSP(iso); return `${p.day}/${p.month}/${p.year} às ${p.hour}:${p.minute}`; };
const isoSP = iso => { const p = partesSP(iso); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; };

/* ---------- Receber ---------- */
const campos = {TIPO:"c-tipo", NUM:"c-num", ANO:"c-ano", DATA:"c-data", AUTOR:"c-autor", ASSUNTO:"c-assunto"};
function status(msg, tipo){ const s = $("c-status"); s.hidden = !msg; s.className = "status " + (tipo||"ok"); s.textContent = msg || ""; }
/* Mensagem com botões de escolha (ex.: retificação ou nova entrega) */
function statusAcoes(msg, tipo, acoes){
  status(msg, tipo);
  const box = document.createElement("div"); box.className = "acoes";
  for(const [txt, fn, ghost] of acoes){
    const b = document.createElement("button"); b.type = "button"; b.className = "btn" + (ghost ? " ghost" : "");
    b.textContent = txt; b.addEventListener("click", fn); box.appendChild(b);
  }
  $("c-status").appendChild(box);
  box.querySelector("button").focus();
}

/* ---------- Retificação: documento que voltou alterado, mesmo nº de protocolo ---------- */
let retif = null;   // última versão do protocolo que está sendo retificado
const rotuloProt = p => p.protocolo + (p.versao > 0 ? ` · Retificação ${p.versao}` : "");
function sairRetif(){
  retif = null;
  $("c-retif").hidden = true;
  $("c-motivo-box").hidden = true; $("c-motivo").value = "";
  $("b-registrar").textContent = "Registrar protocolo";
}
/* manterCampos = true quando os campos já foram preenchidos pela etiqueta nova */
function iniciarRetif(p, manterCampos){
  if(!manterCampos || procedencia !== p.procedencia) setProc(p.procedencia === "TERCEIROS" ? "TERCEIROS" : "PREFEITURA");
  retif = p;
  if(!manterCampos){
    const val = {"c-tipo":p.tipo, "c-num":p.numero, "c-ano":p.ano, "c-data":p.data_doc, "c-autor":p.autor, "c-assunto":p.assunto};
    for(const [id, v] of Object.entries(val)) $(id).value = v || "";
    atualizarAuto(); ajustarNumeroCam();
  }
  $("c-retif-tit").textContent = `Retificação do protocolo ${p.protocolo} · ${nomeDoc(p)}`;
  $("c-retif-sub").textContent = `Vai entrar como Retificação ${p.versao + 1}, com o mesmo número. ` +
    (manterCampos ? "Confira os campos, escreva o que mudou e registre." : "Leia a etiqueta nova (ou ajuste os campos), escreva o que mudou e registre.");
  $("c-retif").hidden = false;
  $("c-motivo-box").hidden = false;
  $("b-registrar").textContent = "Registrar retificação";
  confirmarDuplicado = "";
  $(manterCampos ? "c-motivo" : (p.procedencia === "TERCEIROS" ? "c-assunto" : "c-scan")).focus();
}
$("b-cancelar-retif").addEventListener("click", () => { sairRetif(); setProc(procedencia); });
/* Última versão de um protocolo (a original ou a retificação mais recente) */
async function ultimaVersao(protocolo){
  const {data, error} = await sb.from("protocolos").select("*").eq("protocolo", protocolo).order("versao", {ascending:false}).limit(1);
  if(error) throw error;
  return data && data[0];
}

/* Data e ano: da etiqueta (quando lida) ou o dia de hoje, sempre automáticos */
function atualizarAuto(){
  const d = $("c-data").value;
  $("c-auto").value = d ? fmtData(d) + " · da etiqueta" : fmtData(hojeSP()) + " · automático";
  $("c-auto").classList.toggle("filled", !!d);
}

/* Procedência: PREFEITURA (etiqueta QR) ou TERCEIROS (registro manual) */
let procedencia = "PREFEITURA";
const hojeSP = () => isoSP(new Date().toISOString()).slice(0,10);
function setProc(p){
  sairRetif();
  procedencia = p;
  const terc = p === "TERCEIROS";
  $("proc-pref").setAttribute("aria-checked", !terc);
  $("proc-terc").setAttribute("aria-checked", terc);
  $("f-cam").dataset.proc = p;
  $("c-scanbox").hidden = terc;
  $("passos-pref").hidden = terc; $("passos-terc").hidden = !terc;
  $("c-autor-rot").textContent = terc ? "Origem (pessoa ou órgão que entregou)" : "Origem / autor";
  $("c-autor").placeholder = terc ? "Ex.: Ministério Público, Associação de Moradores, João da Silva" : "Digite a origem. Ex.: Gabinete do Prefeito, Secretaria de Saúde";
  // Sugestões (Ministério Público, Associação...) só em "Outros"; na Prefeitura é campo livre para digitar
  if(terc) $("c-autor").setAttribute("list", "origens"); else $("c-autor").removeAttribute("list");
  $("c-assunto").placeholder = terc ? "Ex.: Solicita cópia da ata da sessão de 15/09" : "";
  preencherTipos($("c-tipo"), terc ? TIPOS_TERCEIROS : TIPOS_PREFEITURA);
  for(const id of Object.values(campos)){ $(id).value = ""; $(id).classList.remove("filled"); }
  atualizarAuto(); ajustarNumeroCam();
  confirmarDuplicado = ""; status("");
  (terc ? $("c-tipo") : $("c-scan")).focus();
}
$("proc-pref").addEventListener("click", () => { if(procedencia !== "PREFEITURA") setProc("PREFEITURA"); });
$("proc-terc").addEventListener("click", () => { if(procedencia !== "TERCEIROS") setProc("TERCEIROS"); });

/* Prestação de Contas e Outros (da Prefeitura) não têm número: o campo some */
function ajustarNumeroCam(){
  const semNum = procedencia === "PREFEITURA" && semNumero($("c-tipo").value);
  $("c-num-box").hidden = semNum;
  if(semNum){ $("c-num").value = ""; $("c-num").classList.remove("filled"); }
}
$("c-tipo").addEventListener("change", ajustarNumeroCam);

function preencher(txt){
  const d = lerCodigo(txt);
  if(!d){ status("Não reconheci este código. Confira se é a etiqueta da prefeitura e leia de novo.", "warn"); $("c-scan").select(); return false; }
  if(procedencia !== "PREFEITURA") setProc("PREFEITURA");
  for(const [k,id] of Object.entries(campos)){ const el = $(id); el.value = d[k] || ""; el.classList.toggle("filled", !!d[k]); }
  atualizarAuto();
  confirmarDuplicado = "";
  ajustarNumeroCam();
  $("c-scan").value = "";
  if(retif){
    status(`Etiqueta nova lida: ${TIPOS[d.TIPO] || d.TIPO}${d.NUM ? ` nº ${d.NUM}/${d.ANO}` : ""}. Escreva o que mudou e clique em “Registrar retificação”.`, "ok");
    $("c-motivo").focus();
    return true;
  }
  status(`Lido: ${TIPOS[d.TIPO] || d.TIPO}${d.NUM ? ` nº ${d.NUM}/${d.ANO}` : ""}. Confira e clique em “Registrar protocolo”.`, "ok");
  ($("c-rec").value ? $("b-registrar") : $("c-rec")).focus();
  return true;
}
$("c-scan").addEventListener("keydown", e => { if(e.key === "Enter"){ e.preventDefault(); preencher($("c-scan").value); } });
$("c-img").addEventListener("change", e => {
  const f = e.target.files[0]; if(!f) return;
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas"); const sc = Math.min(1, 1400/Math.max(img.width, img.height));
    c.width = img.width*sc; c.height = img.height*sc;
    const g = c.getContext("2d"); g.drawImage(img, 0, 0, c.width, c.height);
    const px = g.getImageData(0, 0, c.width, c.height);
    const r = window.jsQR ? jsQR(px.data, c.width, c.height) : null;
    if(r) preencher(r.data); else status("Não encontrei um QR Code nessa foto. Tente uma foto mais de perto e sem reflexo.", "warn");
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(f); e.target.value = "";
});
document.querySelectorAll("#f-cam input,#f-cam textarea,#f-cam select").forEach(el =>
  el.addEventListener("input", () => { el.classList.remove("filled"); if(el.id !== "c-rec") confirmarDuplicado = ""; }));
$("b-limpar").addEventListener("click", limparCam);
function limparCam(){ setProc(procedencia); }

let confirmarDuplicado = "";   // chave do documento que o usuário decidiu registrar mesmo já existindo
let salvando = false;
$("f-cam").addEventListener("submit", async e => {
  e.preventDefault();
  if(salvando) return;
  // Se o leitor de QR "digitou" a etiqueta em outro campo (ex.: estando em "Outros"), trata como leitura da etiqueta
  const lido = [...document.querySelectorAll("#f-cam input,#f-cam textarea")].find(el => /PROT1;TIPO=/.test(el.value));
  if(lido){ const txt = lido.value; lido.value = ""; preencher(txt.slice(txt.indexOf("PROT1"))); return; }
  const terc = procedencia === "TERCEIROS";
  const d = {tipo:$("c-tipo").value, numero:terc ? "" : $("c-num").value.trim(), ano:terc ? hojeSP().slice(0,4) : ($("c-ano").value.trim() || ($("c-data").value || hojeSP()).slice(0,4)),
             data:terc ? hojeSP() : ($("c-data").value || hojeSP()),
             autor:$("c-autor").value.trim(), assunto:$("c-assunto").value.trim(), rec:$("c-rec").value.trim()};
  if(terc){
    if(!d.tipo){ status("Escolha o tipo do documento.", "warn"); $("c-tipo").focus(); return; }
    if(!d.autor){ status("Escreva quem entregou o documento (pessoa ou órgão).", "warn"); $("c-autor").focus(); return; }
  }else if(!d.tipo){ status("Leia a etiqueta ou escolha o tipo do documento.", "warn"); return; }
  else if(!semNumero(d.tipo) && !d.numero){ status("Informe o número do documento.", "warn"); $("c-num").focus(); return; }
  if(!d.rec){ status("Digite seu nome para registrar o protocolo.", "warn"); $("c-rec").focus(); return; }

  const btn = $("b-registrar"); salvando = true; btn.disabled = true; btn.textContent = "Registrando…";
  try{
    const chave = [d.tipo, d.numero, d.ano].join("|");
    if(!retif && !terc && d.numero && confirmarDuplicado !== chave){
      const {data:ja, error} = await sb.from("protocolos").select("*")
        .eq("direcao", "RECEBIDO").eq("tipo", d.tipo).eq("numero", d.numero).eq("ano", d.ano).order("recebido_em").limit(50);
      if(error) throw error;
      if(ja && ja.length){
        const prim = ja[0], ult = ja[ja.length-1];
        const quantas = ult.protocolo === prim.protocolo && ult.versao > 0 ? ` (já tem ${ult.versao} retificaç${ult.versao === 1 ? "ão" : "ões"})` : "";
        statusAcoes(`Atenção: ${TIPOS[d.tipo]} nº ${d.numero}/${d.ano} já foi protocolado em ${fmtQuando(prim.recebido_em)}, protocolo ${prim.protocolo}${quantas}. ` +
                    `É o mesmo documento que voltou corrigido?`, "warn", [
          [`Sim, é retificação (manter protocolo ${ult.protocolo})`, () => { status(""); iniciarRetif(ult, true); }],
          ["Não, é nova entrega (novo número)", () => { confirmarDuplicado = chave; status(""); $("f-cam").requestSubmit(); }, true]
        ]);
        return;
      }
    }
    let p, error;
    if(retif){
      ({data:p, error} = await sb.rpc("registrar_retificacao", {p_original:retif.id, p_tipo:d.tipo, p_numero:d.numero,
        p_ano:terc ? retif.ano : d.ano, p_data_doc:terc ? retif.data_doc : d.data,
        p_autor:d.autor, p_assunto:d.assunto, p_motivo:$("c-motivo").value.trim(), p_recebido_por:d.rec}));
    }else{
      ({data:p, error} = await sb.rpc("registrar_protocolo", {p_tipo:d.tipo, p_numero:d.numero, p_ano:d.ano, p_data_doc:d.data,
                                                              p_autor:d.autor, p_assunto:d.assunto, p_recebido_por:d.rec,
                                                              p_procedencia:procedencia}));
    }
    if(error) throw error;
    lembrar.set("nome", d.rec);
    precisaRecarregarLista = true;
    try{ mostrarComprovante(p); }catch(e){ console.error(e); }   // já está gravado: um erro ao desenhar o comprovante não pode parecer falha no registro
    for(const id of Object.values(campos)){ $(id).value = ""; $(id).classList.remove("filled"); }
    sairRetif();
    atualizarAuto(); ajustarNumeroCam();
    confirmarDuplicado = "";
    status(`${p.versao > 0 ? "Retificação registrada" : "Protocolo registrado"}: ${rotuloProt(p)}.`, "ok");
  }catch(err){
    status("Não foi possível registrar: " + erroAmigavel(err), "err");
  }finally{
    salvando = false; btn.disabled = false; btn.textContent = retif ? "Registrar retificação" : "Registrar protocolo";
  }
});

function mostrarComprovante(p){
  if(p.direcao === "ENVIADO") return mostrarComprovanteEnvio(p);
  const ret = p.versao > 0;
  const cod = ["CAMARA-PROT1", "PROT="+p.protocolo, ...(ret ? ["RET="+p.versao] : []), "QUANDO="+isoSP(p.recebido_em),
               "DOC="+p.tipo+(p.numero ? " "+semAcento(p.numero)+"/"+semAcento(p.ano) : ""), "REC="+semAcento(p.recebido_por)].join(";");
  $("comprovante").innerHTML = `<div class="head"><span>${esc(C.NOME_CAMARA||"Câmara Municipal")} · ${ret ? "Comprovante de retificação" : "Comprovante de protocolo"}</span><span class="via">Via do portador</span></div>
    <div class="qr" id="qr-comp"></div>
    <dl><dt>Protocolo</dt><dd class="bignum">${esc(p.protocolo)}</dd>
    ${ret ? `<dt>Retificação</dt><dd>nº ${p.versao} · protocolo original de ${p.retifica_em ? fmtQuando(p.retifica_em) : "—"}</dd>` : ""}
    <dt>${ret ? "Retificação recebida em" : "Recebido em"}</dt><dd>${fmtQuando(p.recebido_em)}</dd>
    ${ret ? `<dt>O que mudou</dt><dd style="font-weight:400">${esc(p.motivo||"—")}</dd>` : ""}
    <dt>Documento</dt><dd>${esc(nomeDoc(p))}</dd>
    <dt>Origem</dt><dd>${esc(p.autor||"—")}${p.procedencia === "TERCEIROS" ? "" : ` <span style="font-weight:400;color:#555">(Prefeitura)</span>`}</dd>
    <dt>Assunto</dt><dd style="font-weight:400">${esc(p.assunto||"—")}</dd>
    <dt>Recebido por</dt><dd>${esc(p.recebido_por)}</dd></dl>
    <div class="assin"><div>Assinatura de quem recebeu (${esc(p.recebido_por)})</div><div>Assinatura do portador</div></div>
    <div class="foot">${esc(cod)}</div>`;
  qr($("qr-comp"), cod);
  $("imp-box").hidden = false;
  setTimeout(() => $("b-imprimir").focus(), 50);
  const el = $("comprovante"); el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
}
$("b-imprimir").addEventListener("click", () => {
  if(!$("comprovante").querySelector(".qr")) return;
  imprimirPapel($("comprovante"), $("imp-2vias").checked ? ["Via do portador","Via da Câmara"] : ["Via do portador"]);
});

/* ---------- Enviar (vereadores → prefeito, secretarias, deputados...) ---------- */
preencherTipos($("e-tipo"), TIPOS_TERCEIROS);
function envStatus(msg, tipo){ const s = $("e-status"); s.hidden = !msg; s.className = "full status " + (tipo||"ok"); s.textContent = msg || ""; }
let ultimoOficio = null, confirmarOficio = "";
function ajustarTipoEnvio(){
  const of = $("e-tipo").value === "OF";
  $("e-num-box").hidden = !of;
  $("e-ultimo").hidden = !of || !ultimoOficio;
  confirmarOficio = "";
}
$("e-tipo").addEventListener("change", () => { ajustarTipoEnvio(); if($("e-tipo").value === "OF") $("e-num").focus(); });
$("e-num").addEventListener("input", () => { confirmarOficio = ""; });

/* Destinatário: escolhe o cargo e aparece o campo para digitar o nome */
function ajustarCargo(){
  const c = $("e-cargo").value;
  $("e-dest-box").hidden = !c;
  if(!c) return;
  const outro = c === "Outro";
  $("e-dest-rot").textContent = outro ? "Para quem vai (nome e cargo ou órgão)"
    : c === "Secretário(a) Municipal" ? "Nome do(a) Secretário(a) e secretaria" : "Nome do(a) " + c;
  $("e-dest").placeholder = outro ? "Ex.: Diretor da Escola Estadual João XXIII"
    : c === "Secretário(a) Municipal" ? "Ex.: Maria Souza, Secretaria de Saúde" : "Digite o nome";
}
$("e-cargo").addEventListener("change", () => { ajustarCargo(); if($("e-cargo").value) $("e-dest").focus(); });
const destinatario = () => {
  const c = $("e-cargo").value, n = $("e-dest").value.trim();
  if(!c || !n) return "";
  return c === "Outro" ? n : `${c} – ${n}`;
};

async function prepararEnvio(){
  const ano = hojeSP().slice(0,4);
  $("e-auto").value = fmtData(hojeSP()) + " · automático";
  $("e-ano-rot").textContent = "/" + ano;
  if(!$("e-rec").value) $("e-rec").value = lembrar.get("nome");
  ajustarTipoEnvio();
  try{
    // Último ofício de vereador registrado no ano, para ajudar a seguir a sequência manual
    const {data:ult} = await sb.from("protocolos").select("numero,ano,autor,recebido_em")
      .eq("direcao","ENVIADO").eq("tipo","OF").eq("ano", ano).order("recebido_em", {ascending:false}).limit(1);
    ultimoOficio = ult && ult[0] || null;
    if(ultimoOficio){
      const n = parseInt(ultimoOficio.numero, 10);
      $("e-ultimo").innerHTML = `Último ofício registrado: <b>nº ${esc(ultimoOficio.numero)}/${esc(ultimoOficio.ano)}</b> (${esc(ultimoOficio.autor)}, ${fmtQuando(ultimoOficio.recebido_em)}).` +
        (Number.isFinite(n) ? ` <button type="button" class="link" id="b-usar-prox">Usar nº ${n+1}</button>` : "");
      const b = $("b-usar-prox"); if(b) b.addEventListener("click", () => { $("e-num").value = n+1; confirmarOficio = ""; $("e-ver").focus(); });
    }
    ajustarTipoEnvio();
  }catch(e){ /* a dica do último ofício é opcional */ }
}

let enviando = false;
$("f-env").addEventListener("submit", async e => {
  e.preventDefault();
  if(enviando) return;
  const d = {tipo:$("e-tipo").value, numero:$("e-tipo").value === "OF" ? $("e-num").value.trim() : "",
             ver:$("e-ver").value.trim(), dest:destinatario(), assunto:$("e-assunto").value.trim(), rec:$("e-rec").value.trim()};
  if(!d.tipo){ envStatus("Escolha o tipo do documento.", "warn"); $("e-tipo").focus(); return; }
  if(d.tipo === "OF" && !d.numero){ envStatus("Digite o número do ofício.", "warn"); $("e-num").focus(); return; }
  if(!d.ver){ envStatus("Escreva o nome do vereador ou da vereadora.", "warn"); $("e-ver").focus(); return; }
  if(!$("e-cargo").value){ envStatus("Escolha para quem vai o documento.", "warn"); $("e-cargo").focus(); return; }
  if(!d.dest){ envStatus("Digite o nome do destinatário.", "warn"); $("e-dest").focus(); return; }
  if(!d.rec){ envStatus("Digite seu nome para registrar.", "warn"); $("e-rec").focus(); return; }

  const btn = $("b-enviar"); enviando = true; btn.disabled = true; btn.textContent = "Registrando…";
  try{
    const ano = hojeSP().slice(0,4);
    if(d.tipo === "OF" && confirmarOficio !== d.numero){
      const {data:ja, error} = await sb.from("protocolos").select("protocolo,recebido_em,autor")
        .eq("direcao","ENVIADO").eq("tipo","OF").eq("numero", d.numero).eq("ano", ano).limit(1);
      if(error) throw error;
      if(ja && ja.length){
        confirmarOficio = d.numero;
        envStatus(`Atenção: o ofício nº ${d.numero}/${ano} já foi registrado em ${fmtQuando(ja[0].recebido_em)} (${ja[0].autor}, protocolo ${ja[0].protocolo}). Confira o número. Se estiver certo, clique em “Registrar envio” de novo.`, "warn");
        return;
      }
    }
    const {data:p, error} = await sb.rpc("registrar_envio", {p_tipo:d.tipo, p_numero:d.numero, p_vereador:d.ver,
                                                            p_destinatario:d.dest, p_assunto:d.assunto, p_registrado_por:d.rec});
    if(error) throw error;
    lembrar.set("nome", d.rec);
    precisaRecarregarLista = true;
    try{ mostrarComprovanteEnvio(p); }catch(e){ console.error(e); }
    for(const id of ["e-num","e-cargo","e-dest","e-assunto"]) $(id).value = "";
    ajustarCargo();
    confirmarOficio = "";
    envStatus(`Envio registrado: protocolo ${p.protocolo}.`, "ok");
    precisaRecarregarLista = true;
    prepararEnvio();
  }catch(err){
    envStatus("Não foi possível registrar: " + erroAmigavel(err), "err");
  }finally{
    enviando = false; btn.disabled = false; btn.textContent = "Registrar envio";
  }
});
$("b-limpar-env").addEventListener("click", () => {
  for(const id of ["e-num","e-ver","e-cargo","e-dest","e-assunto"]) $(id).value = "";
  ajustarCargo();
  $("e-tipo").value = ""; confirmarOficio = ""; envStatus(""); ajustarTipoEnvio(); $("e-tipo").focus();
});

function mostrarComprovanteEnvio(p){
  const cod = ["CAMARA-ENV1", "PROT="+p.protocolo, "QUANDO="+isoSP(p.recebido_em),
               "DOC="+p.tipo+(p.numero ? " "+semAcento(p.numero)+"/"+semAcento(p.ano) : ""), "VER="+semAcento(p.autor), "PARA="+semAcento(p.destinatario)].join(";");
  $("e-comprovante").innerHTML = `<div class="head"><span>${esc(C.NOME_CAMARA||"Câmara Municipal")} · Protocolo de envio</span><span class="via">Via do destinatário</span></div>
    <div class="qr" id="qr-env"></div>
    <dl><dt>Protocolo</dt><dd class="bignum">${esc(p.protocolo)}</dd>
    <dt>Registrado em</dt><dd>${fmtQuando(p.recebido_em)}</dd>
    <dt>Documento</dt><dd>${esc(nomeDoc(p))}</dd>
    <dt>Vereador(a)</dt><dd>${esc(p.autor)}</dd>
    <dt>Destinatário</dt><dd>${esc(p.destinatario)}</dd>
    <dt>Assunto</dt><dd style="font-weight:400">${esc(p.assunto||"—")}</dd>
    <dt>Registrado por</dt><dd>${esc(p.recebido_por)}</dd></dl>
    <div class="assin"><div>Assinatura de quem registrou (${esc(p.recebido_por)})</div><div>Recebido pelo destinatário em ___/___/______</div></div>
    <div class="foot">${esc(cod)}</div>`;
  qr($("qr-env"), cod);
  $("e-imp-box").hidden = false;
  setTimeout(() => $("b-imprimir-env").focus(), 50);
  const el = $("e-comprovante"); el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
}
$("b-imprimir-env").addEventListener("click", () => {
  if(!$("e-comprovante").querySelector(".qr")) return;
  imprimirPapel($("e-comprovante"), $("e-imp-2vias").checked ? ["Via do destinatário","Via da Câmara"] : ["Via do destinatário"]);
});

/* ---------- Lista ---------- */
const POR_PAG = 20;
const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const tiposSel = new Set();
let dirSel = "";   // "" = tudo, "RECEBIDO" ou "ENVIADO"
let pagina = 1, precisaRecarregarLista = true, seqLista = 0, linhas = [], retificados = new Map();
const mesAtual = () => isoSP(new Date().toISOString()).slice(0,7);
const nomeMes = k => { const [a,m] = k.split("-"); return MESES[+m-1][0].toUpperCase() + MESES[+m-1].slice(1) + " de " + a; };
const proxMes = k => { let [a,m] = k.split("-").map(Number); m++; if(m>12){ m=1; a++; } return `${a}-${String(m).padStart(2,"0")}`; };
const termos = () => semAcento($("l-busca").value).toLowerCase().replace(/[%_*,()\\"']/g, " ").split(" ").filter(Boolean);

async function carregarMeses(){
  const sel = $("l-mes"); const atual = sel.value || mesAtual();
  const {data} = await sb.rpc("meses_com_protocolo");
  const meses = [...new Set((data||[]).map(r => r.mes).concat(mesAtual(), atual === "todos" ? [] : [atual]))].sort().reverse();
  sel.innerHTML = meses.map(k => `<option value="${k}">${nomeMes(k)}${k===mesAtual()?" (este mês)":""}</option>`).join("") + `<option value="todos">Todos os períodos</option>`;
  sel.value = atual;
}

function filtrar(q, comTipo){
  const t = termos();
  if(t.length){ for(const w of t) q = q.ilike("busca", `%${w}%`); }          // busca: em todos os períodos
  else if($("l-mes").value !== "todos"){
    const m = $("l-mes").value;
    q = q.gte("recebido_em", `${m}-01T00:00:00-03:00`).lt("recebido_em", `${proxMes(m)}-01T00:00:00-03:00`);
  }
  if(dirSel) q = q.eq("direcao", dirSel);
  if(comTipo && tiposSel.size) q = q.in("tipo", [...tiposSel]);
  return q;
}

async function carregarLista(){
  const minha = ++seqLista;
  $("l-conta").textContent = "Carregando…";
  try{
    if(precisaRecarregarLista){ await carregarMeses(); precisaRecarregarLista = false; }
    const de = (pagina-1)*POR_PAG;
    const principal = filtrar(sb.from("protocolos").select("*", {count:"exact"}), true)
      .order("recebido_em", {ascending:false}).range(de, de+POR_PAG-1);
    const contagens = ["", ...Object.keys(TIPOS)].map(t => {
      let q = filtrar(sb.from("protocolos").select("id", {count:"exact", head:true}), false);
      if(t) q = q.eq("tipo", t);
      return q;
    });
    const [res, ...conts] = await Promise.all([principal, ...contagens]);
    if(minha !== seqLista) return;                       // chegou uma consulta mais nova
    if(res.error) throw res.error;
    const total = res.count || 0;
    const paginas = Math.max(1, Math.ceil(total/POR_PAG));
    if(pagina > paginas){ pagina = paginas; return carregarLista(); }
    linhas = res.data || [];
    // Marca na lista os protocolos originais que já tiveram retificação
    retificados = new Map();
    const originais = [...new Set(linhas.filter(p => p.direcao === "RECEBIDO" && !p.versao).map(p => p.protocolo))];
    if(originais.length){
      const {data:rs} = await sb.from("protocolos").select("protocolo,versao").in("protocolo", originais).gt("versao", 0);
      if(minha !== seqLista) return;
      for(const r of rs || []) retificados.set(r.protocolo, Math.max(retificados.get(r.protocolo) || 0, r.versao));
    }
    renderChips(conts.map(c => c.count || 0));
    renderTabela(total, paginas);
  }catch(err){
    if(minha !== seqLista) return;
    $("l-conta").textContent = "";
    $("l-body").innerHTML = `<tr><td colspan="7" class="empty">Não foi possível carregar: ${esc(erroAmigavel(err))}</td></tr>`;
    $("l-pager").innerHTML = "";
  }
}

function renderChips(n){
  const [todos, ...porTipo] = n;
  $("l-chips").innerHTML = `<button type="button" class="chip todos" data-t="" aria-pressed="${tiposSel.size===0}">Todos <span class="n">${todos}</span></button>` +
    Object.entries(TIPOS).map(([k,v], i) => `<button type="button" class="chip" data-t="${k}" aria-pressed="${tiposSel.has(k)}">${v} <span class="n">${porTipo[i]}</span></button>`).join("");
}

function renderTabela(total, paginas){
  $("l-body").innerHTML = linhas.length ? linhas.map((p, i) => `<tr>
      <td class="code">${esc(p.protocolo)}${p.versao > 0 ? `<br><span class="tag-ret">Retificação ${p.versao}</span>`
            : retificados.has(p.protocolo) ? `<br><span class="tag-ret leve">Retificado (${retificados.get(p.protocolo)}×)</span>` : ""}</td>
      <td class="code">${fmtQuando(p.recebido_em)}</td>
      <td><span class="pill${p.direcao === "ENVIADO" ? " env" : ""}">${esc(p.tipo)}</span> ${p.numero ? esc(p.numero)+"/"+esc(p.ano) : ""}</td>
      <td>${p.direcao === "ENVIADO"
            ? `${esc(p.autor)} → ${esc(p.destinatario||"—")}<br><span class="origem-tag env">Enviado</span>`
            : `${esc(p.autor||"—")}<br><span class="origem-tag">${p.procedencia === "TERCEIROS" ? "Outros" : "Prefeitura"}</span>`}</td>
      <td>${esc(p.assunto||"—")}</td>
      <td>${esc(p.recebido_por)}</td>
      <td><div class="acoes-linha"><button type="button" class="btn ghost small" data-i="${i}">Comprovante</button>
        ${p.direcao === "RECEBIDO" ? `<button type="button" class="btn ghost small" data-r="${i}" title="Documento voltou alterado: registrar com o mesmo número">Retificar</button>` : ""}</div></td></tr>`).join("")
    : `<tr><td colspan="7" class="empty">${termos().length ? "Nada encontrado com essa busca." : "Nenhum protocolo neste período com esses filtros. Troque o período para ver outros meses."}</td></tr>`;

  const ini = total ? (pagina-1)*POR_PAG+1 : 0, fim = Math.min(pagina*POR_PAG, total);
  const per = termos().length ? (total===1 ? "encontrado" : "encontrados") + " em todos os períodos" : $("l-mes").value === "todos" ? "em todos os períodos" : "em " + nomeMes($("l-mes").value).toLowerCase();
  const dirTxt = dirSel === "ENVIADO" ? (total===1 ? " enviado" : " enviados") : dirSel === "RECEBIDO" ? (total===1 ? " recebido" : " recebidos") : "";
  $("l-conta").textContent = `${total} protocolo${total===1?"":"s"}${dirTxt} ${per}` + (tiposSel.size ? ` · tipos: ${[...tiposSel].map(t => TIPOS[t]).join(", ")}` : "");
  $("l-mes").disabled = termos().length > 0;

  let nums = [];
  for(let i=1; i<=paginas; i++){ if(i===1 || i===paginas || Math.abs(i-pagina)<=1) nums.push(i); else if(nums[nums.length-1] !== "…") nums.push("…"); }
  $("l-pager").innerHTML = paginas <= 1 ? (total ? `<span class="hint">Mostrando ${ini}–${fim} de ${total}</span>` : "") :
    `<span class="hint">Mostrando ${ini}–${fim} de ${total} · página ${pagina} de ${paginas}</span>
     <div class="pg"><button type="button" data-p="${pagina-1}" ${pagina===1?"disabled":""}>← Anterior</button>
     ${nums.map(n => n==="…" ? '<span class="hint" style="align-self:center">…</span>' : `<button type="button" data-p="${n}" ${n===pagina?'aria-current="page"':""}>${n}</button>`).join("")}
     <button type="button" data-p="${pagina+1}" ${pagina===paginas?"disabled":""}>Próxima →</button></div>`;
}

$("l-chips").addEventListener("click", e => {
  const b = e.target.closest(".chip"); if(!b) return; const t = b.dataset.t;
  if(!t) tiposSel.clear(); else tiposSel.has(t) ? tiposSel.delete(t) : tiposSel.add(t);
  pagina = 1; carregarLista();
});
$("l-dir").addEventListener("click", e => {
  const b = e.target.closest(".chip"); if(!b) return;
  dirSel = b.dataset.d;
  $("l-dir").querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", c === b));
  pagina = 1; carregarLista();
});
$("l-mes").addEventListener("change", () => { pagina = 1; carregarLista(); });
let timerBusca;
$("l-busca").addEventListener("input", () => { clearTimeout(timerBusca); timerBusca = setTimeout(() => { pagina = 1; carregarLista(); }, 350); });
$("l-pager").addEventListener("click", e => {
  const b = e.target.closest("button[data-p]"); if(!b || b.disabled) return;
  pagina = +b.dataset.p; carregarLista(); $("pane-lista").scrollIntoView({block:"start"});
});
$("l-body").addEventListener("click", async e => {
  const r = e.target.closest("button[data-r]");
  if(r){
    r.disabled = true;
    try{
      const ult = await ultimaVersao(linhas[+r.dataset.r].protocolo);   // retifica sempre a partir da versão mais recente
      ir("receber"); status("");
      iniciarRetif(ult, false);
      $("pane-receber").scrollIntoView({block:"start"});
    }catch(err){ ir("receber"); status("Não foi possível abrir a retificação: " + erroAmigavel(err), "err"); }
    finally{ r.disabled = false; }
    return;
  }
  const b = e.target.closest("button[data-i]"); if(!b) return;
  const p = linhas[+b.dataset.i];
  if(p.direcao === "ENVIADO"){ ir("enviar"); envStatus(""); mostrarComprovanteEnvio(p); $("e-comprovante").scrollIntoView({block:"center"}); }
  else{ ir("receber"); status(""); mostrarComprovante(p); $("comprovante").scrollIntoView({block:"center"}); }
});

/* ---------- Abas ---------- */
function ir(k){
  for(const t of ["receber","enviar","lista"]){ $("pane-"+t).hidden = t !== k; $("tab-"+t).setAttribute("aria-selected", t === k); }
  if(k === "receber") $("c-scan").focus();
  if(k === "enviar"){ prepararEnvio(); $("e-tipo").focus(); }
  if(k === "lista") carregarLista();
}
document.querySelectorAll("nav button").forEach(b => b.addEventListener("click", () => ir(b.dataset.go)));
