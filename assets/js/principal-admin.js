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

  // ---- set today as default date ----
  var dtEl = document.getElementById('pt-date');
  if(dtEl) dtEl.value = new Date().toISOString().slice(0,10);

  // ---- file drop wiring ----
  var ptDrop = document.getElementById('pt-drop');
  var ptFile = document.getElementById('pt-file');
  var ptFname = document.getElementById('pt-fname');
  if(ptDrop && ptFile){
    ptDrop.addEventListener('click', function(){ ptFile.click(); });
    ptFile.addEventListener('change', function(){
      if(ptFile.files && ptFile.files[0]){
        ptFname.textContent = ptFile.files[0].name;
        ptDrop.classList.add('has-file');
      }
    });
    ptDrop.addEventListener('dragover', function(e){ e.preventDefault(); ptDrop.classList.add('has-file'); });
    ptDrop.addEventListener('drop', function(e){
      e.preventDefault();
      if(e.dataTransfer.files[0]){ ptFile.files = e.dataTransfer.files; ptFname.textContent = e.dataTransfer.files[0].name; ptDrop.classList.add('has-file'); }
    });
  }

  // ---- amount / NTA → units calc ----
  var ptAmount = document.getElementById('pt-amount');
  var ptNta    = document.getElementById('pt-nta');
  var ptUnits  = document.getElementById('pt-units');
  function recalc(){ var a=parseNum(ptAmount.value), n=parseNum(ptNta.value); ptUnits.value=(a>0&&n>0)?fmt(a/n):'—'; }
  if(ptAmount){ ptAmount.addEventListener('input',recalc); }
  if(ptNta)   { ptNta.addEventListener('input',recalc); }

  // ---- load investors into select ----
  async function loadInvestorSelect(){
    if(typeof sb==='undefined'||!sb) return;
    var res = await sb.from('profiles').select('id,full_name').order('full_name');
    if(res.error || !res.data) return;
    var sel = document.getElementById('pt-investor');
    res.data.forEach(function(p){
      var o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.full_name || p.id;
      sel.appendChild(o);
    });
  }

  // ---- render table ----
  function renderTable(rows){
    var tbody = document.getElementById('ptBody');
    if(!rows || rows.length===0){
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--fg-3);padding:24px;">No transactions found.</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    rows.forEach(function(r){
      var units = (r.amount && r.nta) ? fmt(r.amount/r.nta) : '—';
      var tr = document.createElement('tr'); tr.className='clickable';
      tr.innerHTML =
        '<td>'+fmtDate(r.date)+'</td>'+
        '<td>'+( r.full_name||'—')+'</td>'+
        '<td>'+tTag(r.type||'Subscription')+'</td>'+
        '<td class="td-right">'+fmt(r.amount)+'</td>'+
        '<td class="td-right">'+(r.nta?parseFloat(r.nta).toFixed(4):'—')+'</td>'+
        '<td class="td-right">'+units+'</td>'+
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

  // ---- upload document to storage ----
  async function uploadDoc(file, txId){
    if(!file) return null;
    var ext = file.name.split('.').pop().toLowerCase();
    var path = txId+'/document.'+ext;
    var up = await sb.storage.from(BUCKET).upload(path, file, { upsert:true, contentType:file.type });
    if(up.error) throw new Error('Upload failed: '+up.error.message);
    var url = sb.storage.from(BUCKET).getPublicUrl(path);
    return url.data.publicUrl;
  }

  // ---- get public URL for existing doc ----
  function getDocUrl(documentPath){
    if(!documentPath) return null;
    // If already a full URL, return as-is
    if(documentPath.startsWith('http')) return documentPath;
    var url = sb.storage.from(BUCKET).getPublicUrl(documentPath);
    return url.data.publicUrl;
  }

  // ---- post transaction ----
  document.getElementById('openPtModal').addEventListener('click', function(){ zyModalOpen('ptModal'); });

  document.getElementById('pt-post').addEventListener('click', async function(){
    var invId  = document.getElementById('pt-investor').value;
    var invName = document.getElementById('pt-investor').options[document.getElementById('pt-investor').selectedIndex]?.text || '';
    var type   = document.getElementById('pt-type').value;
    var date   = document.getElementById('pt-date').value;
    var amt    = parseNum(ptAmount.value);
    var nta    = parseNum(ptNta.value);
    var file   = ptFile && ptFile.files && ptFile.files[0] ? ptFile.files[0] : null;

    if(!invId){ if(window.zyToast) zyToast('Select an investor'); return; }
    if(amt<=0){ if(window.zyToast) zyToast('Enter a valid amount'); return; }
    if(nta<=0){ if(window.zyToast) zyToast('Enter the NTA per unit'); return; }
    if(!date){ if(window.zyToast) zyToast('Select a trade date'); return; }

    var btn = document.getElementById('pt-post');
    btn.disabled=true; btn.textContent='Posting…';

    try{
      // 1. Insert record first to get the ID
      var units = amt / nta;
      var ins = await sb.from('capital_injection').insert({
        uid: invId,
        full_name: invName,
        date: date,
        type: type,
        amount: amt,
        nta: nta,
        units: units,
        status: 'Pending',
        document: null
      }).select().single();

      if(ins.error) throw ins.error;

      // 2. Upload doc if provided, then update record with path
      if(file){
        var docUrl = await uploadDoc(file, ins.data.id);
        await sb.from('capital_injection').update({ document: docUrl }).eq('id', ins.data.id);
      }

      await loadTransactions();
      zyModalClose();
      if(window.zyToast) zyToast(type+' of RM '+fmt(amt)+' posted for '+invName);

      // Reset form
      ptAmount.value=''; ptNta.value=''; ptUnits.value='—';
      ptFile.value=''; ptFname.textContent='Click to attach deposit slip or transfer receipt';
      ptDrop.classList.remove('has-file');
      document.getElementById('pt-investor').value='';
      dtEl.value = new Date().toISOString().slice(0,10);

    }catch(ex){
      if(window.zyToast) zyToast('Error: '+((ex&&ex.message)||'Unknown'));
    }
    btn.disabled=false; btn.textContent='Post Transaction';
  });

  // ---- open view/status modal ----
  function openStatus(r){
    curTx = r;
    document.getElementById('st-sub').textContent  = fmtDate(r.date);
    document.getElementById('st-inv').textContent  = r.full_name||'—';
    document.getElementById('st-type').innerHTML   = tTag(r.type||'Subscription');
    document.getElementById('st-date').textContent = fmtDate(r.date);
    document.getElementById('st-amt').textContent  = 'RM '+fmt(r.amount);
    document.getElementById('st-nta').textContent  = r.nta ? parseFloat(r.nta).toFixed(4) : '—';
    document.getElementById('st-units').textContent = (r.amount&&r.nta) ? fmt(r.amount/r.nta) : '—';
    document.getElementById('st-cur').innerHTML    = sPill(r.status);

    // Document preview
    var docRow = document.getElementById('st-doc-row');
    var docPrev = document.getElementById('st-doc-preview');
    docPrev.innerHTML = '';
    if(r.document){
      docRow.style.display = 'flex';
      var url = getDocUrl(r.document);
      var ext = url.split('?')[0].split('.').pop().toLowerCase();
      if(['jpg','jpeg','png','gif','webp'].indexOf(ext)>-1){
        var img = document.createElement('img'); img.src=url; docPrev.appendChild(img);
      } else {
        var iframe = document.createElement('iframe'); iframe.src=url; iframe.title='Document'; docPrev.appendChild(iframe);
      }
      var link = document.createElement('a'); link.href=url; link.target='_blank'; link.className='doc-link';
      link.innerHTML='↗ Open in new tab'; docPrev.appendChild(link);
    } else {
      docRow.style.display = 'none';
    }

    zyModalOpen('statusModal');
  }

  // ---- status change ----
  async function setStatus(newStatus){
    if(!curTx) return;
    var res = await sb.from('capital_injection').update({ status: newStatus }).eq('id', curTx.id);
    if(res.error){ if(window.zyToast) zyToast('Error: '+res.error.message); return; }
    curTx.status = newStatus;
    document.getElementById('st-cur').innerHTML = sPill(newStatus);
    await loadTransactions();
    zyModalClose();
    if(window.zyToast) zyToast('Status updated to '+newStatus+' — '+(curTx.full_name||''));
  }

  document.getElementById('st-approve').addEventListener('click', function(){ setStatus('Approved'); });
  document.getElementById('st-reject').addEventListener('click',  function(){ setStatus('Rejected'); });
  document.getElementById('st-pending').addEventListener('click', function(){ setStatus('Pending'); });

  // ---- init ----
  window.addEventListener('DOMContentLoaded', function(){
    // Wait for admin-supabase.js session guard, then load
    setTimeout(function(){
      if(typeof sb!=='undefined'&&sb){
        loadInvestorSelect();
        loadTransactions();
      }
    }, 600);
  });

})();
