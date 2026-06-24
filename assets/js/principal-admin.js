/* ============================================================
   ZY-Invest · Capital Injection — Admin logic
   Reads/writes the capital_injection table + storage bucket
   ============================================================ */
(function(){
  var BUCKET = 'capital-injection-docs';
  var curTx = null;

  function fmt(n){ return parseFloat(n||0).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function parseNum(s){ return parseFloat((s||'').toString().replace(/,/g,''))||0; }

  function sPill(s){
    if(!s) return '<span class="pill-warn">Pending</span>';
    s = s.charAt(0).toUpperCase()+s.slice(1).toLowerCase();
    if(s==='Approved') return '<span class="pill-ok">Approved</span>';
    if(s==='Rejected') return '<span class="pill-rej">Rejected</span>';
    return '<span class="pill-warn">Pending</span>';
  }
  function tTag(t){ return t==='Subscription'?'<span class="tag-blue">Subscription</span>':'<span class="tag-orange">Redemption</span>'; }
  function fmtDate(d){ if(!d) return '—'; var dt=new Date(d); return dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); }

  // ---- generate reference ID: SUB-YYYYMMDD-XXXX or RED-YYYYMMDD-XXXX ----
  function buildRefId(type, date, nric){
    var prefix = (type==='Redemption') ? 'RED' : 'SUB';
    var d = date ? date.replace(/-/g,'') : new Date().toISOString().slice(0,10).replace(/-/g,'');
    var suffix = '0000';
    if(nric){
      var digits = nric.replace(/\D/g,'');
      suffix = digits.length >= 4 ? digits.slice(-4) : digits.padStart(4,'0');
    }
    return prefix+'-'+d+'-'+suffix;
  }

  // ---- default date ----
  var dtEl = document.getElementById('pt-date');
  if(dtEl) dtEl.value = new Date().toISOString().slice(0,10);

  // ---- file drop ----
  var ptDrop = document.getElementById('pt-drop');
  var ptFile = document.getElementById('pt-file');
  var ptFname = document.getElementById('pt-fname');
  if(ptDrop && ptFile){
    ptDrop.addEventListener('click', function(){ ptFile.click(); });
    ptFile.addEventListener('change', function(){
      if(ptFile.files && ptFile.files[0]){ ptFname.textContent=ptFile.files[0].name; ptDrop.classList.add('has-file'); }
    });
    ptDrop.addEventListener('dragover', function(e){ e.preventDefault(); ptDrop.classList.add('has-file'); });
    ptDrop.addEventListener('drop', function(e){
      e.preventDefault();
      if(e.dataTransfer.files[0]){ ptFile.files=e.dataTransfer.files; ptFname.textContent=e.dataTransfer.files[0].name; ptDrop.classList.add('has-file'); }
    });
  }

  // ---- amount/NTA → units ----
  var ptAmount = document.getElementById('pt-amount');
  var ptNta    = document.getElementById('pt-nta');
  var ptUnits  = document.getElementById('pt-units');
  function recalc(){ var a=parseNum(ptAmount.value), n=parseNum(ptNta.value); ptUnits.value=(a>0&&n>0)?fmt(a/n):'—'; }
  if(ptAmount) ptAmount.addEventListener('input',recalc);
  if(ptNta)    ptNta.addEventListener('input',recalc);

  // ---- investor select + NRIC map ----
  var INVESTOR_NRIC = {};
  async function loadInvestorSelect(){
    if(typeof sb==='undefined'||!sb) return;
    var res = await sb.from('profiles').select('id,full_name,nric_passport').order('full_name');
    if(res.error||!res.data) return;
    var sel = document.getElementById('pt-investor');
    res.data.forEach(function(p){
      INVESTOR_NRIC[p.id] = p.nric_passport||'';
      var o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.full_name || p.id;
      sel.appendChild(o);
    });
  }

  // ---- render table ----
  function renderTable(rows){
    var tbody = document.getElementById('ptBody');
    if(!rows||rows.length===0){
      tbody.innerHTML='<tr><td colspan="8" style="padding:24px;color:var(--fg-3);">No transactions found.</td></tr>';
      return;
    }
    tbody.innerHTML='';
    rows.forEach(function(r){
      var units = (r.amount&&r.nta) ? fmt(r.amount/r.nta) : '—';
      var tr = document.createElement('tr'); tr.className='clickable';
      tr.innerHTML=
        '<td style="font-family:monospace;font-size:0.82rem;">'+(r.reference_id||'—')+'</td>'+
        '<td>'+fmtDate(r.date)+'</td>'+
        '<td>'+(r.full_name||'—')+'</td>'+
        '<td>'+tTag(r.type||'Subscription')+'</td>'+
        '<td>'+fmt(r.amount)+'</td>'+
        '<td>'+(r.nta?parseFloat(r.nta).toFixed(4):'—')+'</td>'+
        '<td>'+units+'</td>'+
        '<td>'+sPill(r.status)+'</td>';
      tr.addEventListener('click', function(){ openStatus(r); });
      tbody.appendChild(tr);
    });
  }

  // ---- load from Supabase ----
  async function loadTransactions(){
    if(typeof sb==='undefined'||!sb) return;
    var res = await sb.from('capital_injection').select('*').order('date',{ascending:false});
    if(res.error){ if(window.zyToast) zyToast('Load failed: '+res.error.message); return; }
    renderTable(res.data||[]);
  }

  // ---- upload doc ----
  async function uploadDoc(file, txId){
    if(!file) return null;
    var ext = file.name.split('.').pop().toLowerCase();
    var path = txId+'/document.'+ext;
    var up = await sb.storage.from(BUCKET).upload(path, file, {upsert:true, contentType:file.type});
    if(up.error) throw new Error('Upload failed: '+up.error.message);
    return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  // ---- post transaction ----
  document.getElementById('openPtModal').addEventListener('click', function(){ zyModalOpen('ptModal'); });

  document.getElementById('pt-post').addEventListener('click', async function(){
    var sel      = document.getElementById('pt-investor');
    var invId    = sel.value;
    var invName  = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : '';
    var type     = document.getElementById('pt-type').value;
    var date     = document.getElementById('pt-date').value;
    var amt      = parseNum(ptAmount.value);
    var nta      = parseNum(ptNta.value);
    var file     = ptFile&&ptFile.files&&ptFile.files[0] ? ptFile.files[0] : null;

    if(!invId){ if(window.zyToast) zyToast('Select an investor'); return; }
    if(amt<=0){ if(window.zyToast) zyToast('Enter a valid amount'); return; }
    if(nta<=0){ if(window.zyToast) zyToast('Enter the NTA per unit'); return; }
    if(!date)  { if(window.zyToast) zyToast('Select a trade date'); return; }

    var nric = INVESTOR_NRIC[invId]||'';
    var refId = buildRefId(type, date, nric);

    var btn = document.getElementById('pt-post');
    btn.disabled=true; btn.textContent='Posting…';

    try{
      var ins = await sb.from('capital_injection').insert({
        uid: invId,
        full_name: invName,
        date: date,
        type: type,
        amount: amt,
        nta: nta,
        units: amt/nta,
        status: 'Pending',
        reference_id: refId,
        document: null
      }).select().single();

      if(ins.error) throw ins.error;

      if(file){
        var docUrl = await uploadDoc(file, ins.data.id);
        await sb.from('capital_injection').update({document:docUrl}).eq('id',ins.data.id);
      }

      await loadTransactions();
      zyModalClose();
      if(window.zyToast) zyToast(type+' posted — '+refId);

      // reset
      ptAmount.value=''; ptNta.value=''; ptUnits.value='—';
      ptFile.value=''; ptFname.textContent='Click to attach deposit slip or transfer receipt';
      ptDrop.classList.remove('has-file');
      sel.value='';
      dtEl.value=new Date().toISOString().slice(0,10);

    }catch(ex){
      if(window.zyToast) zyToast('Error: '+((ex&&ex.message)||'Unknown'));
    }
    btn.disabled=false; btn.textContent='Post Transaction';
  });

  // ---- open view modal ----
  function openStatus(r){
    curTx = r;
    document.getElementById('st-refid').textContent = r.reference_id||'—';
    document.getElementById('st-inv').textContent   = r.full_name||'—';
    document.getElementById('st-type').innerHTML    = tTag(r.type||'Subscription');
    document.getElementById('st-date').textContent  = fmtDate(r.date);
    document.getElementById('st-amt').textContent   = 'RM '+fmt(r.amount);
    document.getElementById('st-nta').textContent   = r.nta ? parseFloat(r.nta).toFixed(4) : '—';
    document.getElementById('st-units').textContent = (r.amount&&r.nta) ? fmt(r.amount/r.nta) : '—';
    document.getElementById('st-cur').innerHTML     = sPill(r.status);

    // document preview
    var docPrev = document.getElementById('st-doc-preview');
    docPrev.innerHTML = '';
    if(r.document){
      var url = r.document.startsWith('http') ? r.document : sb.storage.from(BUCKET).getPublicUrl(r.document).data.publicUrl;
      var ext = url.split('?')[0].split('.').pop().toLowerCase();
      var wrap = document.createElement('div'); wrap.className='doc-preview-wrap';
      if(['jpg','jpeg','png','gif','webp'].indexOf(ext)>-1){
        var img=document.createElement('img'); img.src=url; wrap.appendChild(img);
      } else {
        var ifr=document.createElement('iframe'); ifr.src=url; ifr.title='Document'; wrap.appendChild(ifr);
      }
      var lnk=document.createElement('a'); lnk.href=url; lnk.target='_blank'; lnk.className='doc-link'; lnk.textContent='↗ Open in new tab';
      wrap.appendChild(lnk);
      docPrev.appendChild(wrap);
    } else {
      docPrev.innerHTML='<div class="doc-empty"><span>📄</span>No document attached</div>';
    }

    zyModalOpen('statusModal');
  }

  // ---- status change ----
  async function setStatus(newStatus){
    if(!curTx) return;
    var res = await sb.from('capital_injection').update({status:newStatus}).eq('id',curTx.id);
    if(res.error){ if(window.zyToast) zyToast('Error: '+res.error.message); return; }
    curTx.status = newStatus;
    document.getElementById('st-cur').innerHTML = sPill(newStatus);
    await loadTransactions();
    zyModalClose();
    if(window.zyToast) zyToast('Status → '+newStatus+' — '+(curTx.full_name||''));
  }

  document.getElementById('st-approve').addEventListener('click', function(){ setStatus('Approved'); });
  document.getElementById('st-reject').addEventListener('click',  function(){ setStatus('Rejected'); });
  document.getElementById('st-pending').addEventListener('click', function(){ setStatus('Pending'); });

  // ---- init ----
  window.addEventListener('DOMContentLoaded', function(){
    setTimeout(function(){
      if(typeof sb!=='undefined'&&sb){ loadInvestorSelect(); loadTransactions(); }
    }, 600);
  });
})();
