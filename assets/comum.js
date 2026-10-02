/* Protocolo QR da Câmara — funções comuns (etiqueta e câmara) */
const TIPOS = {PL:"Projeto de Lei",PLC:"Projeto de Lei Complementar",LEI:"Lei",DEC:"Decreto",MV:"Mensagem de Veto",OF:"Ofício",PC:"Prestação de Contas",REQ:"Requerimento",OP:"Outro pedido",OUT:"Outros"};
const TIPOS_PREFEITURA = ["PL","PLC","LEI","DEC","MV","OF","PC","OUT"];
const TIPOS_TERCEIROS  = ["OF","REQ","OP"];
/* Tipos que não têm número: o campo "Número" some do formulário */
const TIPOS_SEM_NUMERO = ["PC","OUT"];
const semNumero = t => TIPOS_SEM_NUMERO.includes(t);
const $ = id => document.getElementById(id);

function preencherTipos(select, chaves = TIPOS_PREFEITURA){
  select.innerHTML = '<option value="">—</option>' + chaves.map(k => `<option value="${k}">${TIPOS[k]}</option>`).join("");
}
/* "Projeto de Lei nº 45/2026" ou só "Requerimento" quando não há número */
const nomeDoc = p => (TIPOS[p.tipo] || p.tipo) + (p.numero ? ` nº ${p.numero}/${p.ano}` : "");

/* Formato do QR: só letras sem acento, números e ; = para funcionar com qualquer leitor USB (teclado ABNT) */
const semAcento = t => (t||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .replace(/ª/g,"a").replace(/º/g,"o").replace(/[–—]/g,"-").replace(/[“”]/g,'"').replace(/[‘’]/g,"'")
  .replace(/[^\x20-\x7E]/g,"")              // QR só com caracteres simples (o gerador falha com símbolos especiais)
  .replace(/[;=]/g,",").replace(/\s+/g," ").trim();
const corta = (t, n) => t.length > n ? t.slice(0, n-3) + "..." : t;

function montarCodigo(d){
  return ["PROT1","TIPO="+d.tipo,"NUM="+semAcento(d.num),"ANO="+semAcento(d.ano),"DATA="+(d.data||""),
          "AUTOR="+corta(semAcento(d.autor),120),"ASSUNTO="+corta(semAcento(d.assunto),500)].join(";");
}
function lerCodigo(txt){
  txt = (txt||"").trim();
  const i = txt.indexOf("PROT1"); if(i<0) return null;
  const out = {};
  for(const par of txt.slice(i).split(";").slice(1)){
    const k = par.indexOf("="); if(k>0) out[par.slice(0,k).trim().toUpperCase()] = par.slice(k+1).trim();
  }
  return out.TIPO ? out : null;
}

function qr(el, text){
  // Nunca deixa um erro do gerador de QR atrapalhar o registro: tenta de novo mais simples e, em último caso, avisa no papel
  const tentar = (t, nivel) => { el.innerHTML = ""; new QRCode(el, {text:t, width:300, height:300, correctLevel:nivel}); };
  try{ tentar(text, QRCode.CorrectLevel.M); return true; }catch(e){}
  try{ tentar(text.replace(/[^\x20-\x7E]/g,""), QRCode.CorrectLevel.L); return true; }catch(e){}
  el.innerHTML = '<div style="width:150px;height:150px;display:grid;place-items:center;text-align:center;font-size:.75rem;color:#555;border:1px dashed #bbb;padding:8px">QR Code indisponível. Use o número do protocolo.</div>';
  return false;
}
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const fmtData = iso => iso ? iso.slice(0,10).split("-").reverse().join("/") : "—";
const hojeISO = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset()*60000).toISOString().slice(0,10); };

/* Guarda pequenas conveniências deste computador (ex.: último nome digitado) */
const lembrar = {
  get(k){ try{ return localStorage.getItem("protqr_"+k) || ""; }catch(e){ return ""; } },
  set(k,v){ try{ localStorage.setItem("protqr_"+k, v); }catch(e){} }
};

/* Imprime cópias de um elemento .paper. Cada item de "vias" sai em folha separada. */
function imprimirPapel(orig, vias, classe){
  let area = $("print-area");
  if(!area){ area = document.createElement("div"); area.id = "print-area"; document.body.appendChild(area); }
  area.className = classe || "";
  area.innerHTML = vias.map((nome, i) => {
    const c = orig.cloneNode(true);
    c.removeAttribute("id"); c.classList.remove("pop");
    c.querySelectorAll("[id]").forEach(e => e.removeAttribute("id"));
    const rot = c.querySelector(".head .via"); if(rot && nome) rot.textContent = nome;
    if(i > 0) c.classList.add("nova-folha");
    return c.outerHTML;
  }).join("");
  window.print();
}

/* Espera as bibliotecas externas carregarem */
function quandoPronto(teste, fn, tentativas = 60){
  if(teste()) return fn();
  if(tentativas <= 0) return fn(new Error("Bibliotecas não carregaram"));
  setTimeout(() => quandoPronto(teste, fn, tentativas-1), 150);
}
