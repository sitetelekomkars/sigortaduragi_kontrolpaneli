let policies = [], users = [], logs = [];
let proposals = JSON.parse(localStorage.getItem('proposals')) || [];
let finance = [];
let settings = { companies: [], branches: [] };
let currentUser = JSON.parse(localStorage.getItem('user')) || null;
let sessionToken = localStorage.getItem('sessionToken') || null;
let currentIP = '---';
let currentPolicyFilter = null; // null, 'Aktif', 'Geçmiş'
const gasUrl = 'https://script.google.com/macros/s/AKfycbw62mHUcrTH1BnKQLTW-FiPtJsO8_7cygbhyzjxLkdbUGViiffFXq5LSp_3iFpWHarrow/exec';

let monthlyChartInstance = null;
let branchChartInstance = null;

const sdApiKey = 'SD_SERVER_SECURE_KEY_2024';

async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

function md5(s) { 
    // Kept for backward compatibility if needed, but not recommended
    var k=[],i=0;for(;i<64;)k[i]=0|Math.abs(Math.sin(++i))*4294967296;var a=0x67452301,b=0xefcdab89,c=0x98badcfe,d=0x10325476;s=unescape(encodeURIComponent(s));var m=[],n=s.length,o=[a,b,c,d],j=0;for(;j<n;j++)m[j>>2]|=s.charCodeAt(j)<<((j%4)<<3);m[n>>2]|=0x80<<((n%4)<<3);m[((n+8)>>6<<4)+14]=n*8;for(i=0;i<m.length;i+=16){a=o[0];b=o[1];c=o[2];d=o[3];for(j=0;j<64;j++){var f,g;if(j<16){f=(b&c)|(~b&d);g=j;}else if(j<32){f=(d&b)|(~d&c);g=(5*j+1)%16;}else if(j<48){f=b^c^d;g=(3*j+5)%16;}else{f=c^(b|~d);g=(7*j)%16;}var t=d;d=c;c=b;b=0|b+(a+f+k[j]+(m[i+g]>>>0)<<[7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21][(j>>4<<2)|(j%4)]|((a+f+k[j]+(m[i+g]>>>0))>>>(32-[7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21][(j>>4<<2)|(j%4)])));a=t;}o[0]+=a;o[1]+=b;o[2]+=c;o[3]+=d;}function hex(n){var s="",j=0;for(;j<4;j++)s+=((n>>(j*8+4))&0x0F).toString(16)+((n>>(j*8))&0x0F).toString(16);return s;}return hex(o[0])+hex(o[1])+hex(o[2])+hex(o[3]);}

function parseAmount(val) { 
    if(typeof val==='number') return val; 
    if(!val) return 0; 
    let s = val.toString().trim();
    // If it's like 1.234,56 (TR) -> remove dot, swap comma
    if (s.includes('.') && s.includes(',')) {
        if (s.indexOf('.') < s.indexOf(',')) s = s.replace(/\./g, '').replace(',', '.');
        else s = s.replace(/,/g, ''); // 1,234.56 -> remove comma
    } else if (s.includes(',')) {
        // Only comma: 1234,56
        s = s.replace(',', '.');
    }
    return parseFloat(s.replace(/[^0-9.-]/g, '')) || 0; 
}
function cleanDate(d) { if(!d) return ''; try { const dt = new Date(d); if(isNaN(dt.getTime())) return d.split('T')[0]; return dt.toISOString().split('T')[0]; } catch { return d.split('T')[0]; } }
function fmtCy(v) { return new Intl.NumberFormat('tr-TR', {style:'currency', currency:'TRY'}).format(v||0); }
function showToast(msg, type='info') { const c=document.getElementById('toast-container'); if(!c) return; const t=document.createElement('div'); t.className=`toast ${type}`; t.innerHTML=`<i data-lucide="${type==='error'?'alert-octagon':'check-circle'}"></i><span>${escapeHtml(msg)}</span>`; c.appendChild(t); lucide.createIcons(); setTimeout(()=>t.remove(),4000); }

function normalizeText(v) { return (v ?? '').toString().trim(); }
function normalizeKey(v) { return normalizeText(v).toLocaleLowerCase('tr-TR'); }
function digitsOnly(v) { return normalizeText(v).replace(/\D+/g, ''); }
function escapeHtml(v) { return normalizeText(v).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function matchOptionValue(list = [], value = '') {
    const clean = normalizeText(value);
    if (!clean) return '';
    const found = list.find(item => normalizeKey(item) === normalizeKey(clean));
    return found || clean;
}
function normalizePolicyRecord(p = {}) {
    return {
        ...p,
        id: p.id || p.ID || Date.now() + Math.random(),
        status: normalizeText(p.status) || 'Aktif',
        issue_date: cleanDate(p.issue_date || p.issueDate || p.tanzim_tarihi || p.tanzim),
        start_date: cleanDate(p.start_date || p.startDate || p.police_baslangic || p.baslangic_tarihi || p.issue_date),
        expiry_date: cleanDate(p.expiry_date || p.expiryDate || p.police_bitis || p.vade || p.bitis_tarihi),
        policy_no: normalizeText(p.policy_no || p.police_no || p.police || p.policyNumber),
        customer_name: normalizeText(p.customer_name || p.musteri || p.customer || p.musteri_ad_soyad || p.unvan),
        customer_id: normalizeText(p.customer_id || p.tc_vkn || p.tc || p.vkn),
        phone: digitsOnly(p.phone || p.telefon),
        birth_date: cleanDate(p.birth_date || p.dogum_tarihi),
        ek_no: parseInt(p.ek_no ?? p.ekno ?? p.ekNo ?? 0, 10) || 0,
        region: normalizeText(p.region || p.bolge),
        company: normalizeText(p.company || p.sirket || p.company_name),
        branch: normalizeText(p.branch || p.brans || p.branch_name),
        description: normalizeText(p.description || p.aciklama || p.plaka),
        net_premium: parseAmount(p.net_premium ?? p.net ?? p.netPrim),
        gross_premium: parseAmount(p.gross_premium ?? p.gross ?? p.brut_prim ?? p.brutPrim),
        commission: parseAmount(p.commission ?? p.komisyon),
        notes: normalizeText(p.notes || p.note || p.notlar),
        doc_url: normalizeText(p.doc_url || p.document_url || p.evrak_url || p.drive_url)
    };
}
function setSelectValue(elId, value, sourceList = []) {
    const el = document.getElementById(elId);
    if (!el) return;
    const resolved = matchOptionValue(sourceList, value);
    if (!resolved) {
        el.value = '';
        return;
    }
    let option = Array.from(el.options).find(opt => normalizeKey(opt.value || opt.text) === normalizeKey(resolved));
    if (!option) {
        option = new Option(resolved, resolved);
        el.add(option);
    }
    el.value = option.value;
}
function resetPolicyForm() {
    const form = document.getElementById('form-policy');
    if (!form) return;
    form.reset();
    delete form.dataset.updateId;
    const title = document.getElementById('policy-drawer-title');
    const submitBtn = document.getElementById('policy-submit-btn');
    if (title) title.textContent = 'Yeni Poliçe';
    if (submitBtn) submitBtn.innerHTML = '<i data-lucide="save"></i> Kaydet';
    document.getElementById('p_ek').value = 0;
    document.getElementById('p_doc_url').value = '';
    const fileContainer = document.getElementById('file-list-container');
    if (fileContainer) fileContainer.innerHTML = '';
    updateFormDropdowns();
    lucide.createIcons();
}
function validatePolicyForm(data) {
    const errors = [];
    if (!data.company) errors.push('Şirket seçilmelidir.');
    if (!data.branch) errors.push('Branş seçilmelidir.');
    if (!data.policy_no) errors.push('Poliçe numarası zorunludur.');
    if (!data.customer_name) errors.push('Müşteri adı zorunludur.');
    if (!data.issue_date || !data.start_date || !data.expiry_date) errors.push('Tarih alanları zorunludur.');
    if (data.start_date && data.expiry_date && new Date(data.expiry_date) < new Date(data.start_date)) errors.push('Bitiş tarihi başlangıçtan önce olamaz.');
    if (data.net_premium < 0 || data.gross_premium < 0 || data.commission < 0) errors.push('Tutar alanları negatif olamaz.');
    if (data.customer_id && !/^\d{10,11}$/.test(digitsOnly(data.customer_id))) errors.push('TC / VKN 10 veya 11 haneli olmalıdır.');
    if (data.phone && !/^\d{10,11}$/.test(digitsOnly(data.phone))) errors.push('Telefon 10 veya 11 haneli olmalıdır.');
    return errors;
}
function getPolicySearchTerm() {
    return normalizeKey(document.getElementById('filter-policy-search')?.value || document.getElementById('global-search')?.value || '');
}
function applyPolicyFilters(list) {
    const company = normalizeText(document.getElementById('filter-company')?.value);
    const branch = normalizeText(document.getElementById('filter-branch')?.value);
    const q = getPolicySearchTerm();
    return list.filter(p => {
        if (currentPolicyFilter && p.status !== currentPolicyFilter) return false;
        if (company && normalizeKey(p.company) !== normalizeKey(company)) return false;
        if (branch && normalizeKey(p.branch) !== normalizeKey(branch)) return false;
        if (q) {
            const hay = [p.policy_no, p.customer_name, p.company, p.branch, p.description, p.customer_id, p.phone].map(normalizeText).join(' ').toLocaleLowerCase('tr-TR');
            if (!hay.includes(q)) return false;
        }
        return true;
    });
}
async function deletePolicy(id) {
    const target = policies.find(p => String(p.id) === String(id));
    if (!target) return;
    if (!confirm(`${target.policy_no || 'Bu kayıt'} silinsin mi?`)) return;
    try {
        const res = await fetch(gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'deletePolicy', id: id, apiKey: sdApiKey, sessionToken: sessionToken })
        }).then(r => r.json());
        if (res.status !== 'success') throw new Error(res.message || 'Silme işlemi başarısız');
        policies = policies.filter(p => String(p.id) !== String(id));
        localStorage.setItem('policies_local', JSON.stringify(policies));
        computeStatuses();
        renderKpis(); renderCharts(); renderPolicies(); renderRenewals(); renderCustomers(); renderDocumentsTable();
        showToast('Poliçe silindi.', 'success');
        logAction('POLIÇE SİL', `${target.policy_no} - ${target.customer_name}`);
    } catch (err) {
        console.error(err);
        showToast('Poliçe silinemedi.', 'error');
    }
}
function attachUiEvents() {
    [['filter-policy-search','input'], ['filter-company','change'], ['filter-branch','change'], ['global-search','input']].forEach(([id, evt]) => {
        const el = document.getElementById(id);
        if (!el || el.dataset.bound === '1') return;
        el.addEventListener(evt, () => renderPolicies());
        el.dataset.bound = '1';
    });
    const tc = document.getElementById('p_tc');
    const phone = document.getElementById('p_phone');
    [tc, phone].forEach(el => {
        if (!el || el.dataset.bound === '1') return;
        el.addEventListener('input', () => { el.value = digitsOnly(el.value); });
        el.dataset.bound = '1';
    });
    if (!window.__userMenuCloseBound) {
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('user-menu');
            const profile = document.querySelector('.user-profile');
            if (menu && profile && !menu.contains(e.target) && !profile.contains(e.target)) menu.classList.remove('active');
        });
        window.__userMenuCloseBound = true;
    }
}

async function init() {
    const loginScr = document.getElementById('login-screen');
    const passScr = document.getElementById('password-change-screen');
    
    if(!currentUser) { 
        if(loginScr) loginScr.style.display='flex'; 
        if(passScr) passScr.style.display='none';
        fetchIP(); 
        return; 
    }

    if(loginScr) loginScr.style.display='none';
    if(passScr) passScr.style.display='none';
    
    lucide.createIcons();
    
    const unameDisp = document.getElementById('header-username');
    if(unameDisp) unameDisp.textContent = currentUser.name || currentUser.username;
    
    const roleDisp = document.getElementById('header-role');
    if(roleDisp) roleDisp.textContent = currentUser.role.toUpperCase();
    
    const avDisp = document.getElementById('header-avatar');
    if(avDisp) avDisp.textContent = (currentUser.name || currentUser.username).charAt(0).toUpperCase();

    // Sidebar settings link removed

    setupNavigation();
    setupTheme();
    await loadData();
    checkAdminUI();
}

function checkAdminUI() {
    if (!currentUser) return;
    const isAdmin = currentUser.role.toLowerCase() === 'admin';
    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = isAdmin ? 'flex' : 'none';
    });
}

async function fetchIP() { try { const r=await fetch('https://api.ipify.org?format=json'); const d=await r.json(); currentIP=d.ip; document.getElementById('login-ip').textContent=`Bağlantı IP: ${currentIP}`; } catch(e){} }

// Initial data load handled by the more comprehensive loadData function below.

const loginForm = document.getElementById('login-form');
const twofaForm = document.getElementById('twofa-form');

if (loginForm) {
    loginForm.addEventListener('submit', async(e)=>{
        e.preventDefault(); 
        const u = document.getElementById('username').value;
        const rawP = document.getElementById('password').value;
        const p = await sha256(rawP);
        const btn = document.getElementById('login-btn');
        const errBox = document.getElementById('login-error');
        
        if(errBox) errBox.style.display = 'none';
        btn.disabled = true;
        btn.innerHTML = '<i class="spin-icon" data-lucide="loader-2"></i> Giriş Yapılıyor...';
        lucide.createIcons();

        try {
            const res = await fetch(gasUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action: "login", username: u, password: p, apiKey: sdApiKey })
            }).then(r => r.json());

            if(res.status === "2fa_required") {
                // Show 2FA step
                loginForm.style.display = 'none';
                twofaForm.style.display = 'block';
                twofaForm.dataset.username = res.username;
                twofaForm.dataset.rawP = rawP; // Keep for force change check
                showToast("2FA Kodu Gerekli", "info");
            } else if(res.status === "success") {
                handleLoginSuccess(res.user, rawP === "123456", res.sessionToken);
            } else {
                if(errBox) {
                    errBox.textContent = res.message || "Hatalı kullanıcı adı veya şifre!";
                    errBox.style.display = 'block';
                }
                showToast(res.message || "Hatalı giriş!", "error");
            }
        } catch(err) { 
            showToast("Bağlantı hatası!", "error"); 
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span>Sisteme Giriş Yap</span>';
            lucide.createIcons();
        }
    });
}

if (twofaForm) {
    twofaForm.addEventListener('submit', async(e) => {
        e.preventDefault();
        const u = twofaForm.dataset.username;
        const code = document.getElementById('2fa-code').value;
        const btn = document.getElementById('2fa-btn');
        const errBox = document.getElementById('2fa-error');
        const isDefaultPass = twofaForm.dataset.rawP === "123456";

        if(errBox) errBox.style.display = 'none';
        btn.disabled = true;
        btn.innerHTML = '<i class="spin-icon" data-lucide="loader-2"></i> Doğrulanıyor...';
        lucide.createIcons();

        try {
            const res = await fetch(gasUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                redirect: 'follow',
                body: JSON.stringify({ action: "verify2FA", username: u, code: code, apiKey: sdApiKey })
            }).then(r => r.json());

            if(res.status === "success") {
                handleLoginSuccess(res.user, isDefaultPass, res.sessionToken);
            } else {
                if(errBox) {
                    errBox.textContent = res.message || "Geçersiz kod!";
                    errBox.style.display = 'block';
                }
                showToast("Kod doğrulanamadı!", "error");
            }
        } catch(e) {
            showToast("Bağlantı hatası!", "error");
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Doğrula ve Giriş Yap';
            lucide.createIcons();
        }
    });
}

function handleLoginSuccess(user, shouldForceChange, token) {
    if(shouldForceChange) {
        sessionStorage.setItem('temp_user', JSON.stringify(user));
        if (token) sessionStorage.setItem('temp_token', token);
        document.getElementById('password-change-screen').style.display = 'flex';
        lucide.createIcons();
    } else {
        localStorage.setItem('user', JSON.stringify(user)); 
        if (token) {
            localStorage.setItem('sessionToken', token);
            sessionToken = token;
        }
        currentUser = user;
        logAction('GIRIŞ', 'Sisteme giriş yapıldı');
        showToast("Giriş başarılı!", "success"); 
        attachUiEvents();
        init();
    }
}

document.getElementById('form-password-change').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const newP = document.getElementById('new_pass').value;
    const confirmP = document.getElementById('confirm_pass').value;
    const tempUserStr = sessionStorage.getItem('temp_user');
    
    if(!tempUserStr) { showToast("Oturum zaman aşımına uğradı, lütfen tekrar giriş yapın.", "error"); location.reload(); return; }
    const tempUser = JSON.parse(tempUserStr);

    if(newP !== confirmP) { showToast("Şifreler uyuşmuyor!", "error"); return; }
    if(newP === "123456") { showToast("Yeni şifre eskisiyle aynı olamaz!", "error"); return; }
    const hashedP = await sha256(newP);

    btn.disabled = true;
    btn.innerHTML = '<i class="spin-icon" data-lucide="loader-2"></i> Güncelleniyor...';
    lucide.createIcons();

    try {
        const response = await fetch(gasUrl, {
            method:'POST',
            headers: { 'Content-Type': 'text/plain' },
            redirect: 'follow', // Mandatory for GAS redirects
            body:JSON.stringify({
                action:"saveUser", 
                apiKey: sdApiKey,
                data: { 
                    username: tempUser.username, 
                    password_hash: hashedP,
                    force_password_change: false 
                }
            })
        });
        
        // Even with no-cors, we proceed as we sent the data
        sessionStorage.setItem('user', JSON.stringify(tempUser));
        sessionStorage.removeItem('temp_user');
        currentUser = tempUser;
        await logAction('SIFRE_DEGISIM', 'Kullanıcı şifresini güncelledi');
        showToast("Şifreniz başarıyla güncellendi.", "success");
        attachUiEvents();
init(); // This will now hide the screen correctly
    } catch(err) { 
        showToast("Bağlantı hatası! Şifre güncellenemedi.", "error"); 
    } finally {
        btn.disabled = false;
        btn.textContent = 'Şifreyi Güncelle ve Başla';
    }
});

function setupTheme() {
    const btn = document.getElementById('theme-toggle');
    if(localStorage.getItem('theme')==='dark') document.body.setAttribute('data-theme', 'dark');
    btn.addEventListener('click', ()=>{
        const current = document.body.getAttribute('data-theme');
        if(current === 'dark') { document.body.setAttribute('data-theme', 'light'); localStorage.setItem('theme', 'light'); }
        else { document.body.setAttribute('data-theme', 'dark'); localStorage.setItem('theme', 'dark'); }
        renderCharts(); // Re-render charts for theme
    });
}

function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(el => {
        el.addEventListener('click', (e)=>{
            e.preventDefault();
            const page = el.getAttribute('data-page');
            if(page) {
                if (page === 'policies') currentPolicyFilter = null; // Sidebar 'Poliçeler' click resets filter
                if (page === 'dashboard') currentPolicyFilter = null;
                showPage(page);
                if (page === 'policies') renderPolicies(); // Force re-render on nav
            }
        });
    });
}

function showPage(id) {
    document.querySelectorAll('.nav-item').forEach(n => {
        n.classList.remove('active');
        if(n.getAttribute('data-page') === id) n.classList.add('active');
    });
    document.querySelectorAll('.page-section').forEach(p=>p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.getElementById('user-menu').classList.remove('active'); // Close menu on navigation
    
    if(id === 'dashboard') { renderKpis(); renderCharts(); }
    if(id === 'policies') renderPolicies();
    if(id === 'renewals') renderRenewals();
    if(id === 'customers') renderCustomers();
    if(id === 'proposals') renderProposals();
    if(id === 'documents') renderDocumentsTable();
    if(id === 'reports') renderReports();
    if(id === 'logs') renderLogsTable();
    if(id === 'settings') renderUsersTable();
    if(id === 'finance') renderFinanceTable();
    if(id === 'settings-mgmt') renderSettingsMgmt();
    if(id === 'commissions') renderCommissionSummary();
    
    logAction('SAYFA_GECIS', id);
}

async function logAction(act, detail="") {
    const username = currentUser ? (currentUser.name || currentUser.username) : 'Sistem';
    const payload = {
        action: "addLog",
        username: username,
        action_type: act,
        details: detail,
        ip: currentIP || '---'
    };

    try {
        fetch(gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            redirect: 'follow',
            body: JSON.stringify({ ...payload, apiKey: sdApiKey, sessionToken: sessionToken })
        });
    } catch(e) {
        console.warn("Log sync failed");
    }

    const localLogs = JSON.parse(localStorage.getItem('logs_local') || "[]");
    localLogs.unshift({dt: new Date().toISOString(), user: username, act, detail, ip: currentIP});
    localStorage.setItem('logs_local', JSON.stringify(localLogs.slice(0, 500)));
}

function renderLogsTable() {
    const container = document.getElementById('table-logs');
    if(!container) return;
    container.innerHTML = logs.map(l => `
        <tr>
            <td><small>${new Date(l.dt||l.timestamp).toLocaleString('tr-TR')}</small></td>
            <td><strong>${l.user||l.username}</strong></td>
            <td><span class="badge badge-neutral" style="font-size:0.65rem;">${(l.act||l.action || 'İŞLEM').toUpperCase()}</span></td>
            <td><small style="color:var(--text-muted);">${l.detail||l.details||'-'}</small></td>
        </tr>
    `).join('');
}

function renderUsersTable() {
    const container = document.getElementById('table-users');
    if(!container) return;
    container.innerHTML = users.map(u => `
        <tr>
            <td><strong>${u.full_name || u.name || '-'}</strong></td>
            <td><code>${u.username}</code></td>
            <td><span class="badge badge-primary">${u.role.toUpperCase()}</span></td>
            <td>
                <button class="btn btn-outline" style="padding:4px 8px;" title="Düzenle" onclick="openEditUser('${u.username}')"><i data-lucide="edit" style="width:14px;"></i></button>
            </td>
        </tr>
    `).join('');
    lucide.createIcons();
}

function openEditUser(username) {
    const u = users.find(x => x.username === username);
    if(!u) return;
    document.getElementById('u_fullname').value = u.full_name || u.name || '';
    document.getElementById('u_username').value = u.username;
    document.getElementById('u_role').value = u.role;
    
    // Check if 2FA setup should be shown/hidden or labelled
    const setupBtn = document.getElementById('setup-2fa-btn-drawer');
    if(setupBtn) {
        const has2FA = u.two_fa_enabled === true || u.two_fa_enabled === 'TRUE';
        setupBtn.innerHTML = `<i data-lucide="${has2FA ? 'shield-check' : 'shield'}"></i> ${has2FA ? '2FA Sıfırla / Kur' : '2FA Kurulumu'}`;
        setupBtn.style.color = has2FA ? 'var(--success)' : 'var(--primary)';
        lucide.createIcons();
    }
    
    openDrawer('user-drawer');
}

async function setupTwoFactor() {
    const username = document.getElementById('u_username').value;
    if(!username) return;
    
    showToast("Kurulum hazırlanıyor...", "info");
    try {
        const res = await fetch(gasUrl, {
            method: 'POST',
            body: JSON.stringify({ action: 'setup2FA', username: username, apiKey: sdApiKey })
        }).then(r => r.json());
        
        if(res.status === 'success') {
            const qrContainer = document.getElementById('2fa-qr-container');
            const secretBox = document.getElementById('2fa-secret-text');
            
            // Generate QR using public API
            qrContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(res.qrUrl)}" alt="QR Code" style="width:200px; height:200px;">`;
            secretBox.textContent = res.secret.replace(/(.{4})/g, '$1 ').trim();
            
            openDrawer('twofa-setup-drawer');
            logAction('2FA_KURULUM', `${username} için 2FA kurulumu başlatıldı`);
        } else {
            showToast("Kurulum başlatılamadı!", "error");
        }
    } catch(e) {
        showToast("Bağlantı hatası!", "error");
    }
}

async function resetUserPassword() {
    const username = document.getElementById('u_username').value;
    if(!username) return;
    if(!confirm(`${username} kullanıcısının şifresi '123456' olarak sıfırlanacak. Onaylıyor musunuz?`)) return;
    
    showToast("Şifre sıfırlanıyor...", "info");
    try {
        const response = await fetch(gasUrl, { 
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            redirect: 'follow',
            body: JSON.stringify({ 
                action: "saveUser", 
                apiKey: sdApiKey,
                sessionToken: sessionToken,
                data: { 
                    username, 
                    password_hash: await sha256("123456"),
                    force_password_change: true
                }
            }) 
        });
        const res = await response.json();
        console.log("Reset Result:", res);
        showToast("Şifre başarıyla sıfırlandı. Kullanıcı ilk girişte değiştirmeli.", "success");
        closeAllDrawers();
        setTimeout(loadData, 1000); // Wait a bit before refresh for GAS to process
    } catch(e) { showToast("İşlem başarısız!", "error"); }
}

const formUser = document.getElementById('form-user');
if(formUser) {
    formUser.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = formUser.querySelector('button[type="submit"]');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.innerHTML = '<i class="spin-icon" data-lucide="loader-2"></i> Kaydediliyor...';
        lucide.createIcons();

        const data = {
            username: document.getElementById('u_username').value,
            full_name: document.getElementById('u_fullname').value,
            role: document.getElementById('u_role').value
        };

        try { 
            const response = await fetch(gasUrl, { 
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                redirect: 'follow',
                body: JSON.stringify({ action: "saveUser", apiKey: sdApiKey, sessionToken: sessionToken, data: data }) 
            }); 
            const res = await response.json();
            
            if (res.status === "success") {
                const idx = users.findIndex(x => x.username === data.username);
                if(idx !== -1) users[idx] = {...users[idx], ...data};
                renderUsersTable();
                closeAllDrawers();
                showToast("Kullanıcı güncellendi.", "success");
                setTimeout(loadData, 500);
            } else {
                showToast("Hata: " + res.message, "error");
            }
        } catch(err){ 
            console.error("User Sync Error:", err); 
            showToast("Bağlantı hatası! Veri kaydedilemedi.", "error");
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });
}

function logout() {
    // Only try to log if we have a token
    const promise = sessionToken ? logAction('ÇIKIŞ', 'Kullanıcı oturumu kapattı') : Promise.resolve();
    promise.finally(() => {
        localStorage.removeItem('user');
        localStorage.removeItem('sessionToken');
        sessionStorage.clear(); // Clear any temp data
        location.reload();
    });
}

async function loadData() {
    try {
        const stored = localStorage.getItem('policies_local');
        if(stored) {
            policies = JSON.parse(stored).map(normalizePolicyRecord);
            computeStatuses(); renderKpis(); renderCharts(); renderPolicies();
        }

        // Verify we have a session token before fetching
        if (!sessionToken) return;

        const [pData, prData, clData, uData, lData, sData, finData] = await Promise.all([
            fetch(`${gasUrl}?action=getPolicies&apiKey=${sdApiKey}&sessionToken=${sessionToken}`).then(r=>r.json()),
            fetch(`${gasUrl}?action=getProposals&apiKey=${sdApiKey}&sessionToken=${sessionToken}`).then(r=>r.json()).catch(()=>[]),
            fetch(`${gasUrl}?action=getClaims&apiKey=${sdApiKey}&sessionToken=${sessionToken}`).then(r=>r.json()).catch(()=>[]),
            fetch(`${gasUrl}?action=getUsers&apiKey=${sdApiKey}&sessionToken=${sessionToken}`).then(r=>r.json()).catch(()=>[]),
            fetch(`${gasUrl}?action=getLogs&apiKey=${sdApiKey}&sessionToken=${sessionToken}`).then(r=>r.json()).catch(()=>[]),
            fetch(`${gasUrl}?action=getSettings&apiKey=${sdApiKey}&sessionToken=${sessionToken}`).then(r=>r.json()).catch(()=>[]),
            fetch(`${gasUrl}?action=getFinance&apiKey=${sdApiKey}&sessionToken=${sessionToken}`).then(r=>r.json()).catch(()=>[])
        ]);

        // Check for unauthorized responses
        if (pData && pData.code === 'UNAUTHORIZED') {
            showToast("Oturum süresi doldu, tekrar giriş yapın.", "error");
            logout();
            return;
        }

        if(Array.isArray(pData)) {
            policies = pData.map(normalizePolicyRecord);
            localStorage.setItem('policies_local', JSON.stringify(policies));
        }
        if(Array.isArray(prData)) proposals = prData.map(p=>({...p, amt: parseAmount(p.amt || p.amount)}));
        if(Array.isArray(uData)) users = uData;
        if(Array.isArray(lData)) logs = lData;
        if(Array.isArray(finData)) finance = finData.map(f=>({...f, amount: parseAmount(f.amount)}));

        if(Array.isArray(sData)) {
            settings.companies = [...new Set(sData.filter(s => normalizeKey(s.type) === 'company').map(s => normalizeText(s.value)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr'));
            settings.branches = [...new Set(sData.filter(s => normalizeKey(s.type) === 'branch').map(s => normalizeText(s.value)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr'));
            updateFormDropdowns();
        }

        computeStatuses(); renderKpis(); renderCharts(); renderPolicies(); renderCustomers();
        const active = document.querySelector('.page-section.active')?.id;
        if(active === 'proposals') renderProposals();
        if(active === 'documents') renderDocumentsTable();
        if(active === 'finance') renderFinanceTable();
        if(active === 'settings-mgmt') renderSettingsMgmt();
        if(active === 'commissions') renderCommissionSummary();
        if(active === 'renewals') renderRenewals();
        if(active === 'reports') renderReports();
        attachUiEvents();

    } catch(e) { console.warn("Sync failed", e); }
}

function updateFormDropdowns() {
    const cSel = document.getElementById('p_company');
    const bSel = document.getElementById('p_branch');
    const fcSel = document.getElementById('filter-company');
    const fbSel = document.getElementById('filter-branch');
    const currentCompany = normalizeText(cSel?.value);
    const currentBranch = normalizeText(bSel?.value);
    const filterCompany = normalizeText(fcSel?.value);
    const filterBranch = normalizeText(fbSel?.value);

    const companyOptions = [...new Set([...settings.companies, ...policies.map(p => normalizeText(p.company)).filter(Boolean)])].sort((a,b)=>a.localeCompare(b,'tr'));
    const branchOptions = [...new Set([...settings.branches, ...policies.map(p => normalizeText(p.branch)).filter(Boolean)])].sort((a,b)=>a.localeCompare(b,'tr'));

    if(cSel) cSel.innerHTML = '<option value="">Şirket Seçiniz</option>' + companyOptions.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    if(bSel) bSel.innerHTML = '<option value="">Branş Seçiniz</option>' + branchOptions.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');
    if(fcSel) fcSel.innerHTML = '<option value="">Tüm Şirketler</option>' + companyOptions.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    if(fbSel) fbSel.innerHTML = '<option value="">Tüm Branşlar</option>' + branchOptions.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');

    if(cSel) setSelectValue('p_company', currentCompany, companyOptions);
    if(bSel) setSelectValue('p_branch', currentBranch, branchOptions);
    if(fcSel && filterCompany) fcSel.value = matchOptionValue(companyOptions, filterCompany);
    if(fbSel && filterBranch) fbSel.value = matchOptionValue(branchOptions, filterBranch);
}

function computeStatuses() {
    const today = new Date(); today.setHours(0,0,0,0);
    policies.forEach(p=>{
        if(!p.expiry_date) { p.status = 'Aktif'; return; }
        const exp = new Date(p.expiry_date); exp.setHours(0,0,0,0);
        const days = Math.round((exp - today)/(1000*3600*24));
        if(days < 0) p.status = 'Geçmiş';
        else if(days <= 30) p.status = 'Yaklaşan';
        else p.status = 'Aktif';
        p.days_left = days;
    });
}

// ======================== DASHBOARD ======================== //
function renderKpis() {
    let act=0, exp_soon=0, exp=0, month_net=0;
    const today = new Date();
    const curMonth = today.getMonth();
    const curYear = today.getFullYear();

    policies.forEach(p=>{
        if(p.status === 'Aktif') act++;
        else if(p.status === 'Yaklaşan') exp_soon++;
        else if(p.status === 'Geçmiş') exp++;
        
        const issue = new Date(p.issue_date);
        // Direct date part comparison is safest
        if(!isNaN(issue.getTime()) && issue.getMonth() === curMonth && issue.getFullYear() === curYear) {
            month_net += (p.net_premium || 0);
        }
    });
    
    document.getElementById('kpi-active').textContent = act;
    document.getElementById('kpi-expiring').textContent = exp_soon;
    document.getElementById('kpi-expired').textContent = exp;
    document.getElementById('kpi-month-net').textContent = fmtCy(month_net).replace('₺','');

    // Re-attach listeners to ensure they work after data refresh
    const cards = document.querySelectorAll('.stat-card');
    if (cards.length >= 3) {
        // Aktif Poliçe
        cards[0].style.cursor = 'pointer';
        cards[0].onclick = () => { 
            currentPolicyFilter = 'Aktif'; 
            showPage('policies'); 
            renderPolicies(); 
        };

        // Yaklaşan
        cards[1].style.cursor = 'pointer';
        cards[1].onclick = () => { 
            showPage('renewals'); 
            renderRenewals(); 
        };

        // Vadesi Geçen
        cards[2].style.cursor = 'pointer';
        cards[2].onclick = () => { 
            currentPolicyFilter = 'Geçmiş'; 
            showPage('policies'); 
            renderPolicies(); 
        };
    }
}

function renderCharts() {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#a3aed1' : '#64748b';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

    // Monthly
    const ctxMonthly = document.getElementById('monthlyChart').getContext('2d');
    if(monthlyChartInstance) monthlyChartInstance.destroy();
    
    const monthlyMap = {};
    policies.forEach(p=>{
        const d = new Date(p.issue_date);
        if(isNaN(d)) return;
        const key = d.toLocaleString('tr-TR', {month:'short', year:'numeric'});
        monthlyMap[key] = (monthlyMap[key] || 0) + p.net_premium;
    });
    const labels = Object.keys(monthlyMap).slice(-12);
    const mData = Object.values(monthlyMap).slice(-12);

    monthlyChartInstance = new Chart(ctxMonthly, {
        type: 'line', data: { labels: labels, datasets: [{ label: 'Üretim (₺)', data: mData, borderColor: '#4318FF', backgroundColor: 'rgba(67, 24, 255, 0.1)', tension: 0.4, fill: true }] },
        options: { responsive:true, maintainAspectRatio:false, plugins: { legend:{display:false} }, scales: { y:{grid:{color:gridColor}, ticks:{color:textColor}}, x:{grid:{display:false}, ticks:{color:textColor}} } }
    });

    // Branch
    const ctxBranch = document.getElementById('branchChart').getContext('2d');
    if(branchChartInstance) branchChartInstance.destroy();
    const branchMap = {};
    policies.forEach(p=>{ const b = p.branch || 'Diğer'; branchMap[b] = (branchMap[b]||0) + p.net_premium; });

    branchChartInstance = new Chart(ctxBranch, {
        type: 'doughnut', data: { labels: Object.keys(branchMap), datasets: [{ data: Object.values(branchMap), backgroundColor: ['#4318FF', '#05cd99', '#ffce20', '#ee5d50','#6b21a8'] }] },
        options: { responsive:true, maintainAspectRatio:false, plugins: { legend: { position:'right', labels: {color:textColor} } }, cutout:'75%', borderPath:'transparent' }
    });
}

function badgeClass(st) {
    if(st==='Aktif') return 'badge-success';
    if(st==='Yaklaşan') return 'badge-warning';
    if(st==='Geçmiş') return 'badge-danger';
    if(st==='Bekliyor' || st==='Süreçte') return 'badge-warning';
    if(st==='Kabul' || st==='Kapandı') return 'badge-success';
    return 'badge-neutral';
}

function renderPolicies() {
    let list = [...policies].sort((a,b)=>new Date(b.issue_date || 0) - new Date(a.issue_date || 0));
    const headerTitle = document.querySelector('#policies .panel-header h2');

    list = applyPolicyFilters(list);

    if (headerTitle) {
        if (currentPolicyFilter) headerTitle.innerHTML = `Poliçeler (${currentPolicyFilter}) <button class="btn btn-outline" style="padding:2px 8px; font-size:0.7rem; margin-left:10px;" onclick="currentPolicyFilter=null; renderPolicies();">Tümünü Göster</button>`;
        else headerTitle.textContent = "Poliçe Yönetimi";
    }

    const tbody = document.getElementById('table-policies');
    if(!tbody) return;

    if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state">Kriterlere uygun poliçe bulunamadı.</div></td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(p => `<tr>
        <td><span class="badge ${badgeClass(p.status)}">${escapeHtml(p.status)}</span></td>
        <td>${cleanDate(p.start_date)}</td>
        <td>${cleanDate(p.expiry_date)}</td>
        <td><strong>${escapeHtml(p.policy_no)}</strong></td>
        <td>${escapeHtml(p.customer_name)}</td>
        <td>${escapeHtml(p.company)}</td>
        <td>${escapeHtml(p.branch)}</td>
        <td><strong>${fmtCy(p.gross_premium)}</strong></td>
        <td><strong>${fmtCy(p.net_premium)}</strong></td>
        <td>
            <div class="table-actions">
                <button class="btn btn-outline" style="padding:6px 12px;" onclick="showDetails('${escapeHtml(String(p.id))}')" title="Düzenle"><i data-lucide="edit-3" style="width:16px;"></i></button>
                ${p.doc_url ? (p.doc_url.includes('|') ? 
                    `<button class="btn btn-outline" style="padding:6px 12px; color:var(--primary); position:relative;" onclick="showDetails('${escapeHtml(String(p.id))}')" title="Evraklar"><i data-lucide="files" style="width:16px;"></i><span class="badge badge-primary" style="position:absolute; top:-8px; right:-8px; padding:2px 5px; font-size:0.6rem;">${p.doc_url.split('|').length}</span></button>` :
                    `<button class="btn btn-outline" style="padding:6px 12px; color:var(--primary);" onclick="previewDocument('${p.doc_url}', '${escapeHtml(p.policy_no)}')" title="Evrak Gör"><i data-lucide="eye" style="width:16px;"></i></button>`
                ) : ''}
                <button class="btn btn-outline" style="padding:6px 12px; color:var(--danger); border-color: rgba(239,68,68,0.2);" onclick="deletePolicy('${escapeHtml(String(p.id))}')" title="Sil"><i data-lucide="trash-2" style="width:16px;"></i></button>
            </div>
        </td>
    </tr>`).join('');
    lucide.createIcons();
}

// ======================== FINANCE MGMT ======================== //
async function renderFinanceTable() {
    const tbody = document.getElementById('table-finance');
    if(!tbody) return;
    tbody.innerHTML = finance.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(f => `
        <tr>
            <td>${cleanDate(f.date)}</td>
            <td><span class="badge ${f.type==='Gelir'?'badge-success':'badge-danger'}">${f.type}</span></td>
            <td>${f.category}</td>
            <td>${f.description || '-'}</td>
            <td><strong>${fmtCy(f.amount)}</strong></td>
            <td>-</td>
        </tr>
    `).join('');
}

document.getElementById('form-finance').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const data = {
        id: Date.now(),
        date: document.getElementById('fin_date').value,
        type: document.getElementById('fin_type').value,
        category: document.getElementById('fin_cat').value,
        description: document.getElementById('fin_desc').value,
        amount: parseAmount(document.getElementById('fin_amt').value)
    };
    
    btn.disabled = true;
    try {
        const res = await fetch(gasUrl, {
            method: 'POST',
            body: JSON.stringify({ action: 'saveFinance', apiKey: sdApiKey, sessionToken: sessionToken, data })
        }).then(r=>r.json());
        
        if(res.status==='success') {
            showToast("İşlem kaydedildi", "success");
            closeAllDrawers();
            loadData();
        }
    } catch(e) { showToast("Hata oluştu","error"); }
    finally { btn.disabled = false; }
});

// ======================== SETTINGS MGMT ======================== //
function renderSettingsMgmt() {
    document.getElementById('list-companies').innerHTML = settings.companies.map(c => `
        <tr><td>${c}</td><td style="text-align:right;"><button class="btn btn-outline" style="padding:2px 5px; color:var(--danger);" onclick="deleteSetting('company', '${c}')"><i data-lucide="trash-2" style="width:12px;"></i></button></td></tr>
    `).join('');
    document.getElementById('list-branches').innerHTML = settings.branches.map(b => `
        <tr><td>${b}</td><td style="text-align:right;"><button class="btn btn-outline" style="padding:2px 5px; color:var(--danger);" onclick="deleteSetting('branch', '${b}')"><i data-lucide="trash-2" style="width:12px;"></i></button></td></tr>
    `).join('');
    lucide.createIcons();
}

async function addSetting(type) {
    const valInput = document.getElementById(`new-${type}-name`);
    const val = valInput.value.trim();
    if(!val) return;
    
    try {
        await fetch(gasUrl, {
            method: 'POST',
            body: JSON.stringify({ action: 'saveSetting', type, value: val, apiKey: sdApiKey, sessionToken: sessionToken })
        });
        valInput.value = '';
        loadData();
    } catch(e) { showToast("Hata","error"); }
}

async function deleteSetting(type, value) {
    if(!confirm('Bu öğeyi silmek istediğinize emin misiniz?')) return;
    try {
        await fetch(gasUrl, {
            method: 'POST',
            body: JSON.stringify({ action: 'deleteSetting', type, value, apiKey: sdApiKey, sessionToken: sessionToken })
        });
        loadData();
    } catch(e) { showToast("Hata","error"); }
}

function renderCommissionSummary() {
    const summary = {};
    policies.forEach(p => {
        if(!summary[p.branch]) summary[p.branch] = { count: 0, net: 0, comm: 0 };
        summary[p.branch].count++;
        summary[p.branch].net += p.net_premium;
        summary[p.branch].comm += p.commission;
    });

    const tbody = document.getElementById('table-commission-summary');
    if(!tbody) return;
    tbody.innerHTML = Object.keys(summary).sort().map(b => `
        <tr>
            <td><strong>${b}</strong></td>
            <td>${summary[b].count} Adet</td>
            <td>${fmtCy(summary[b].net)}</td>
            <td><strong>${fmtCy(summary[b].comm)}</strong></td>
        </tr>
    `).join('');
}

// ======================== DOCUMENTS MGMT ======================== //
function renderDocumentsTable() {
    const tbody = document.getElementById('table-documents');
    if(!tbody) return;
    
    const searchInput = document.getElementById('search-docs');
    const search = searchInput ? searchInput.value.toLowerCase() : "";
    
    const list = policies.filter(p => p.doc_url && (
        p.customer_name.toLowerCase().includes(search) || 
        p.policy_no.toLowerCase().includes(search)
    ));
    
    tbody.innerHTML = list.flatMap(p => {
        const urls = (p.doc_url || '').split('|').filter(Boolean);
        return urls.map((url, idx) => `
            <tr>
                <td>${cleanDate(p.issue_date)}</td>
                <td><strong>${p.customer_name}</strong></td>
                <td>${p.policy_no} ${urls.length > 1 ? `<span class="badge badge-neutral" style="font-size:0.6rem;">Evrak ${idx+1}</span>` : ''}</td>
                <td>${p.company} / ${p.branch}</td>
                <td>
                    <button class="btn btn-outline" style="padding:6px 12px; color:var(--primary);" onclick="previewDocument('${url}', '${escapeHtml(p.policy_no)} - Evrak ${idx+1}')">
                        <i data-lucide="eye" style="width:16px;"></i> Görüntüle
                    </button>
                </td>
            </tr>
        `);
    }).join('');
    lucide.createIcons();
}

async function updateRenewalNote(id, note) {
    const p = policies.find(x => x.id == id);
    if (!p) return;
    p.notes = note; // Using the notes field to store the renewal status
    showToast("Durum güncelleniyor...", "info");
    try {
        await fetch(gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            redirect: 'follow',
            body: JSON.stringify({ action: "savePolicy", apiKey: sdApiKey, data: p })
        });
        showToast("Durum kaydedildi.", "success");
    } catch (e) {
        showToast("Kayıt başarısız!", "error");
    }
}

function renewPolicy(id) {
    const p = normalizePolicyRecord(policies.find(x => x.id == id) || {}); 
    if(!p.id) return;
    
    // Reset form to clear any previous updateId
    resetPolicyForm();
    
    // We are creating a NEW policy based on the old one
    // So we DON'T set dataset.updateId
    
    // Fill the form with old data
    document.getElementById('p_no').value = p.policy_no || '';
    document.getElementById('p_ek').value = 0; // New policy year usually starts with Ek: 0
    document.getElementById('p_customer').value = p.customer_name || '';
    document.getElementById('p_tc').value = digitsOnly(p.customer_id || '');
    document.getElementById('p_phone').value = digitsOnly(p.phone || '');
    
    // Date Logic: New Start = Old Expiry, New Expiry = New Start + 1 Year
    const today = new Date().toISOString().split('T')[0];
    const oldExpiry = p.expiry_date ? new Date(p.expiry_date).toISOString().split('T')[0] : today;
    
    document.getElementById('p_issue').value = today;
    document.getElementById('p_start').value = oldExpiry;
    
    const expDate = new Date(oldExpiry);
    expDate.setFullYear(expDate.getFullYear() + 1);
    document.getElementById('p_expiry').value = expDate.toISOString().split('T')[0];
    
    document.getElementById('p_net').value = 0; // Zero out premiums as they change
    document.getElementById('p_gross').value = 0;
    document.getElementById('p_comm').value = 0;
    document.getElementById('p_desc').value = p.description || '';
    document.getElementById('p_note').value = 'YENİLEME';
    document.getElementById('p_doc_url').value = ''; // Don't copy old documents
    
    setSelectValue('p_company', p.company, settings.companies);
    setSelectValue('p_branch', p.branch, settings.branches);
    updateFormDropdowns();

    const title = document.getElementById('policy-drawer-title');
    const submitBtn = document.getElementById('policy-submit-btn');
    if (title) title.textContent = `Poliçe Yenileme · ${p.policy_no || ''}`;
    if (submitBtn) submitBtn.innerHTML = '<i data-lucide="refresh-cw"></i> Yenilemeyi Kaydet';
    
    openDrawer('policy-drawer');
    showToast("Poliçe bilgileri kopyalandı. Lütfen yeni prim miktarını girin.", "info");
}

function renderRenewals() {
    const list = policies.filter(p => { 
        if(!p.expiry_date) return false;
        return p.days_left <= 45;
    }).sort((a,b)=> a.days_left - b.days_left);

    document.getElementById('table-renewals').innerHTML = list.map(p => {
        let text = p.days_left < 0 ? `${Math.abs(p.days_left)} Gün Geçti` : `${p.days_left} Gün Kaldı`;
        const options = ["Aranmadı", "Arandı / Düşünüyor", "Teklif Verildi", "Yenilendi"];
        const selectHtml = `<select class="form-control" style="padding:4px; font-size:0.8rem; border-radius:6px;" onchange="updateRenewalNote('${p.id}', this.value)">
            ${options.map(opt => `<option value="${opt}" ${p.notes === opt ? 'selected' : ''}>${opt}</option>`).join('')}
        </select>`;
        
        // Clean phone for WhatsApp
        const waPhone = (p.phone || "").replace(/[^0-9]/g, "");
        const waLink = waPhone ? `https://wa.me/90${waPhone.length === 10 ? waPhone : waPhone.slice(-10)}` : "#";

        return `<tr>
        <td><span class="badge ${badgeClass(p.status)}">${p.status}</span></td>
        <td><strong>${p.customer_name}</strong><br><small style="color:var(--text-muted)">${p.phone||'-'}</small></td>
        <td>${p.policy_no}<br><span style="color:var(--primary); font-size:0.75rem; font-weight:600;">${p.description||'-'}</span></td>
        <td>${cleanDate(p.expiry_date)}</td>
        <td><span style="color:${p.days_left<0?'var(--danger)':'var(--text-main)'}; font-weight:600;">${text}</span></td>
        <td>${selectHtml}</td>
        <td>
            <div style="display:flex; gap:5px;">
                <a href="${waLink}" target="_blank" class="btn btn-outline" title="WhatsApp" style="padding:4px 8px; color:#25D366; border-color:#25D366;">
                    <i data-lucide="message-circle" style="width:14px;"></i>
                </a>
                <button class="btn btn-primary" title="Yenile" style="padding:4px 8px; background:var(--primary);" onclick="renewPolicy('${p.id}')">
                    <i data-lucide="refresh-cw" style="width:14px;"></i>
                </button>
            </div>
        </td>
    </tr>`}).join('');
    lucide.createIcons();
}

function renderCustomers() {
    const cmap = {};
    policies.forEach(p=>{
        const nm = p.customer_name;
        if(!cmap[nm]) cmap[nm] = { tc: p.customer_id, phone: p.phone, count: 0, net: 0 };
        cmap[nm].count++; cmap[nm].net += p.net_premium;
    });

    document.getElementById('table-customers').innerHTML = Object.entries(cmap).map(([name, d]) => `<tr>
        <td><strong>${name}</strong></td>
        <td>${d.tc||'-'}</td>
        <td>${d.phone||'-'}</td>
        <td><span class="badge badge-primary">${d.count} Poliçe</span></td>
        <td><strong>${fmtCy(d.net)}</strong></td>
        <td><button class="btn btn-outline" style="padding:4px 8px;" onclick="showCustomerDetails('${name.replace(/'/g, "\\'")}')"><i data-lucide="eye" style="width:14px;"></i></button></td>
    </tr>`).join('');
    lucide.createIcons();
}

function renderReports() {
    const summary = {}; let tP=0, tZ=0, tN=0, tK=0;
    policies.forEach(p => {
        const c = p.company || 'DİĞER';
        if (!summary[c]) summary[c] = { p: 0, z: 0, n: 0, k: 0 };
        if ((p.ek_no || 0) > 0) { summary[c].z++; tZ++; } else { summary[c].p++; tP++; }
        summary[c].n += p.net_premium; summary[c].k += p.commission; tN += p.net_premium; tK += p.commission;
    });
    document.getElementById('table-reports').innerHTML = Object.entries(summary).map(([name, s]) => {
        const ratio = tN > 0 ? (s.n/tN*100).toFixed(1) : 0;
        return `<tr><td><strong>${name}</strong></td><td>${s.p}</td><td>${s.z}</td><td><strong>${fmtCy(s.n)}</strong></td><td>${fmtCy(s.k)}</td><td>%${ratio}</td></tr>`;
    }).join('');
}

async function approveProposal(id) {
    const p = proposals.find(x => x.id == id);
    if (!p) return;
    p.status = "Kabul";
    showToast("Teklif onaylanıyor...", "info");
    try {
        await fetch(gasUrl, {
            method: 'POST',
            body: JSON.stringify({ action: "saveProposal", apiKey: sdApiKey, sessionToken: sessionToken, data: p })
        });
        showToast("Teklif kabul edildi.", "success");
        renderProposals();
    } catch (e) { showToast("Hata oluştu!", "error"); }
}

function renderProposals() {
    document.getElementById('table-proposals').innerHTML = proposals.map(p => `<tr>
        <td><span class="badge ${badgeClass(p.status)}">${p.status || 'Bekliyor'}</span></td>
        <td>${cleanDate(p.date)}</td><td><strong>${p.customer}</strong></td><td>${p.risk}</td><td>${p.company}</td>
        <td><strong>${fmtCy(p.amount)}</strong></td>
        <td><button class="btn btn-outline" style="padding:4px 8px;" onclick="approveProposal('${p.id}')"><i data-lucide="check-circle" style="width:14px; color:var(--success)"></i></button></td>
    </tr>`).join(''); lucide.createIcons();
}

function editClaim(id) {
    const c = claims.find(x => x.id == id);
    if (!c) return;
    document.getElementById('c_cust').value = c.customer;
    document.getElementById('c_pol').value = c.policy_no;
    document.getElementById('c_date').value = cleanDate(c.date);
    document.getElementById('c_file').value = c.description;
    document.getElementById('c_status').value = c.status;
    document.getElementById('form-claim').dataset.updateId = id;
    openDrawer('claim-drawer');
}

function renderClaims() {
    document.getElementById('table-claims').innerHTML = claims.map(c => `<tr>
        <td><span class="badge ${badgeClass(c.status)}">${c.status || 'Açık'}</span></td>
        <td>${cleanDate(c.date)}</td><td><code>${c.description}</code></td><td><strong>${c.customer}</strong></td><td>${c.policy_no}</td>
        <td>${c.status}</td>
        <td><button class="btn btn-outline" style="padding:4px 8px;" onclick="editClaim('${c.id}')"><i data-lucide="edit-2" style="width:14px;"></i></button></td>
    </tr>`).join(''); lucide.createIcons();
}

// GUI Logic
function openDrawer(id) {
    if (id === 'policy-drawer' && !document.getElementById('form-policy').dataset.updateId) resetPolicyForm();
    document.getElementById(id).classList.add('open');
    document.getElementById('overlay').classList.add('active');
    lucide.createIcons();
}
function closeAllDrawers() {
    document.querySelectorAll('.drawer').forEach(d=>d.classList.remove('open'));
    document.getElementById('overlay').classList.remove('active');
    setTimeout(() => {
        const previewContent = document.getElementById('preview-content');
        if(previewContent) previewContent.innerHTML = '';
    }, 400); 
}

function previewDocument(url, title = "Evrak Önizleme") {
    if (!url) { showToast("Evrak bulunamadı!", "error"); return; }
    const container = document.getElementById('preview-content');
    const titleEl = document.getElementById('preview-title');
    const downloadBtn = document.getElementById('preview-download-btn');
    
    if (titleEl) titleEl.textContent = title;
    if (downloadBtn) downloadBtn.href = url;
    
    const isPdf = url.toLowerCase().includes('.pdf');
    const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(url);
    
    if (container) {
        container.innerHTML = '<div style="color:#fff; text-align:center;"><i class="spin-icon" data-lucide="loader-2" style="width:48px; margin-bottom:10px;"></i><br>Yükleniyor...</div>';
        lucide.createIcons();

        setTimeout(() => {
            let finalUrl = url;
            // Google Drive URL transformation for iframe preview
            if (url.includes('drive.google.com')) {
                if (url.includes('/view')) {
                    finalUrl = url.replace('/view', '/preview');
                } else if (url.includes('id=')) {
                    // Handle id= format if needed, but /view is most common from GAS
                }
            }

            if (isPdf) {
                container.innerHTML = `<iframe src="${finalUrl}" style="width:100%; height:100%; border:none;"></iframe>`;
            } else if (isImage) {
                container.innerHTML = `<img src="${finalUrl}" style="max-width:100%; max-height:100%; object-fit:contain; border-radius:8px;">`;
            } else {
                container.innerHTML = `<iframe src="${finalUrl}" style="width:100%; height:100%; border:none;"></iframe>`;
            }
        }, 300);
    }
    
    openDrawer('preview-drawer');
}

function showCustomerDetails(name) {
    const custPolicies = policies.filter(p => p.customer_name === name);
    if(custPolicies.length === 0) return;
    
    const p = custPolicies[0];
    const totalNet = custPolicies.reduce((sum, curr) => sum + (curr.net_premium || 0), 0);
    
    const html = `
        <div class="stat-card" style="margin-bottom:1rem; border-color:var(--primary);">
             <div class="stat-icon primary"><i data-lucide="user"></i></div>
             <div class="stat-details">
                <span class="stat-label">TC / VKN</span>
                <span class="stat-value" style="font-size:1.1rem;">${p.customer_id || '---'}</span>
             </div>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:1.5rem;">
            <div class="glass-panel" style="margin-bottom:0; padding:1rem;">
                <span class="stat-label">Telefon</span><br>
                <strong>${p.phone || '---'}</strong>
            </div>
            <div class="glass-panel" style="margin-bottom:0; padding:1rem;">
                <span class="stat-label">Toplam Üretim</span><br>
                <strong style="color:var(--success);">${fmtCy(totalNet)}</strong>
            </div>
        </div>
    `;
    document.getElementById('customer-profile-content').innerHTML = html;
    
    document.getElementById('customer-policies-list').innerHTML = custPolicies.map(cp => `
        <tr>
            <td><strong>${cp.policy_no}</strong></td>
            <td>${cp.company}</td>
            <td>${cp.branch}</td>
            <td>${cleanDate(cp.expiry_date)}</td>
        </tr>
    `).join('');
    
    lucide.createIcons();
    openDrawer('customer-drawer');
}

function showDetails(id) {
    const p = normalizePolicyRecord(policies.find(x => x.id == id) || {}); if(!p.id) return;
    updateFormDropdowns();

    document.getElementById('p_no').value = p.policy_no || '';
    document.getElementById('p_ek').value = p.ek_no || 0;
    document.getElementById('p_customer').value = p.customer_name || '';
    document.getElementById('p_tc').value = digitsOnly(p.customer_id || '');
    document.getElementById('p_phone').value = digitsOnly(p.phone || '');
    document.getElementById('p_issue').value = cleanDate(p.issue_date);
    document.getElementById('p_start').value = cleanDate(p.start_date || p.issue_date);
    document.getElementById('p_expiry').value = cleanDate(p.expiry_date);
    document.getElementById('p_net').value = p.net_premium || 0;
    document.getElementById('p_gross').value = p.gross_premium || 0;
    document.getElementById('p_comm').value = p.commission || 0;
    document.getElementById('p_desc').value = p.description || '';
    document.getElementById('p_note').value = p.notes || '';
    document.getElementById('p_doc_url').value = p.doc_url || '';
    setSelectValue('p_company', p.company, settings.companies);
    setSelectValue('p_branch', p.branch, settings.branches);

    const fileContainer = document.getElementById('file-list-container');
    if(fileContainer) {
        fileContainer.innerHTML = '';
        const urls = (p.doc_url || '').split('|').filter(Boolean);
        urls.forEach(url => {
            const fileName = url.split('/').pop().substring(0, 20) + '...';
            const fileItem = document.createElement('div');
            fileItem.className = 'kbd-chip';
            fileItem.style.justifyContent = 'space-between';
            fileItem.style.width = '100%';
            fileItem.innerHTML = `
                <span onclick="previewDocument('${url}', '${escapeHtml(p.policy_no)}')" style="cursor:pointer; display:flex; align-items:center; gap:5px;">
                    <i data-lucide="file-text" style="width:14px;"></i> ${fileName}
                </span>
                <i data-lucide="x" style="width:14px; cursor:pointer; color:var(--danger);" onclick="removeFileFromList(this, '${url}')"></i>
            `;
            fileContainer.appendChild(fileItem);
        });
    }

    document.getElementById('form-policy').dataset.updateId = id;
    const title = document.getElementById('policy-drawer-title');
    const submitBtn = document.getElementById('policy-submit-btn');
    if (title) title.textContent = `Poliçe Güncelle · ${p.policy_no || ''}`;
    if (submitBtn) submitBtn.innerHTML = '<i data-lucide="save"></i> Güncelle';
    openDrawer('policy-drawer');
}

const formPolicy = document.getElementById('form-policy');
if (formPolicy) {
    formPolicy.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = formPolicy.querySelector('button[type="submit"]');
        const originalText = btn.textContent;
        const updateId = formPolicy.dataset.updateId;
        
        btn.disabled = true;
        btn.innerHTML = '<i class="spin-icon" data-lucide="loader-2"></i> Kaydediliyor...';
        lucide.createIcons();

        const data = {
            id: updateId || Date.now(),
            status: 'Aktif',
            issue_date: document.getElementById('p_issue').value,
            start_date: document.getElementById('p_start').value,
            expiry_date: document.getElementById('p_expiry').value,
            policy_no: document.getElementById('p_no').value,
            customer_name: document.getElementById('p_customer').value.toUpperCase(),
            customer_id: document.getElementById('p_tc').value,
            phone: document.getElementById('p_phone').value,
            birth_date: "", // Şimdilik boş, formda alanı yoksa
            ek_no: parseInt(document.getElementById('p_ek').value) || 0,
            region: "", // Şimdilik boş
            company: document.getElementById('p_company').value,
            branch: document.getElementById('p_branch').value,
            description: document.getElementById('p_desc').value,
            net_premium: parseAmount(document.getElementById('p_net').value),
            gross_premium: parseAmount(document.getElementById('p_gross').value),
            commission: parseAmount(document.getElementById('p_comm').value),
            notes: document.getElementById('p_note').value,
            doc_url: document.getElementById('p_doc_url').value
        };

        try { 
            const response = await fetch(gasUrl, { 
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                redirect: 'follow',
                body:JSON.stringify({ action: "savePolicy", apiKey: sdApiKey, sessionToken: sessionToken, data: data }) 
            }); 
            const res = await response.json();

            if (res.status === "success") {
                if (updateId) {
                    const idx = policies.findIndex(x => x.id == updateId);
                    if (idx !== -1) policies[idx] = { ...policies[idx], ...data };
                } else {
                    policies.unshift(data);
                }
                localStorage.setItem('policies_local', JSON.stringify(policies));
                computeStatuses();
                
                const activePage = document.querySelector('.page-section.active')?.id;
                if (activePage === 'dashboard') { renderKpis(); renderCharts(); }
                else if (activePage === 'policies') renderPolicies();
                else if (activePage === 'renewals') renderRenewals();
                
                closeAllDrawers();
                showToast("Poliçe başarıyla kaydedildi.", "success");
                logAction(updateId ? 'POLIÇE DÜZENLE' : 'YENI POLIÇE', data.policy_no + " - " + data.customer_name);
                delete formPolicy.dataset.updateId;
                formPolicy.reset();
                setTimeout(loadData, 500);
            } else {
                showToast("Hata: " + res.message, "error");
            }
        } catch(err){ 
            console.error("Policy Sync Error:", err); 
            showToast("Bağlantı hatası! Veri kaydedilemedi.", "error");
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });
}

const formProposal = document.getElementById('form-proposal');
if (formProposal) {
    formProposal.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = formProposal.querySelector('button[type="submit"]');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.innerHTML = '<i class="spin-icon" data-lucide="loader-2"></i> Gönderiliyor...';
        lucide.createIcons();

        const data = {
            id: Date.now(),
            date: new Date().toISOString().split('T')[0],
            customer: document.getElementById('pr_cust').value,
            risk: document.getElementById('pr_risk').value,
            company: document.getElementById('pr_comp').value,
            amount: parseAmount(document.getElementById('pr_amt').value),
            status: document.getElementById('pr_status').value
        };

        try { 
            const response = await fetch(gasUrl, { 
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                redirect: 'follow',
                body: JSON.stringify({ 
                    action: "saveProposal", 
                    apiKey: sdApiKey,
                    sessionToken: sessionToken,
                    data: data 
                }) 
            });
            const result = await response.json();

            if(result.status === "success") {
                proposals.unshift(data);
                localStorage.setItem('proposals_local', JSON.stringify(proposals));
                renderProposals();
                closeAllDrawers();
                showToast("Teklif başarıyla kaydedildi.", "success");
                logAction('TEKLIF KAYDI', data.customer + " - " + data.amount + " TL");
                formProposal.reset();
                setTimeout(loadData, 500);
            } else {
                showToast("Hata: " + result.message, "error");
            }
        } catch(err) {
            console.error(err);
            showToast("Bağlantı hatası! Veri buluta iletilemedi.", "error");
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });
}

// ======================== FILE UPLOAD ======================== //
// ======================== FILE UPLOAD (MULTIPLE) ======================== //
function removeFileFromList(btn, url) {
    const chip = btn.closest('.kbd-chip');
    if (chip) chip.remove();
    const hiddenInput = document.getElementById('p_doc_url');
    let urls = hiddenInput.value.split('|').filter(u => u !== url && u !== '');
    hiddenInput.value = urls.join('|');
}

const fileInput = document.getElementById('p_file_input');
if(fileInput) {
    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if(!files.length) return;
        
        const container = document.getElementById('file-list-container');
        const hiddenInput = document.getElementById('p_doc_url');
        
        for (const file of files) {
            const statusId = 'file-' + Date.now();
            const tempItem = document.createElement('div');
            tempItem.id = statusId;
            tempItem.className = 'kbd-chip';
            tempItem.innerHTML = `<i class="spin-icon" data-lucide="loader-2" style="width:14px;"></i> ${file.name.substring(0, 20)}...`;
            container.appendChild(tempItem);
            lucide.createIcons();
            
            const reader = new FileReader();
            reader.onload = async () => {
                const base64 = reader.result.split(',')[1];
                try {
                    const res = await fetch(gasUrl, {
                        method: 'POST',
                        body: JSON.stringify({
                            action: 'uploadFile',
                            apiKey: sdApiKey,
                            fileName: file.name,
                            mimeType: file.type,
                            base64: base64
                        })
                    }).then(r=>r.json());
                    
                    if(res.status==='success') {
                        let currentUrls = hiddenInput.value ? hiddenInput.value.split('|') : [];
                        currentUrls.push(res.url);
                        hiddenInput.value = currentUrls.join('|');
                        
                        const item = document.getElementById(statusId);
                        item.style.justifyContent = 'space-between';
                        item.style.width = '100%';
                        item.innerHTML = `
                            <span onclick="previewDocument('${res.url}', '${file.name}')" style="cursor:pointer; display:flex; align-items:center; gap:5px;">
                                <i data-lucide="check" style="width:14px; color:var(--success);"></i> ${file.name.substring(0, 20)}...
                            </span>
                            <i data-lucide="x" style="width:14px; cursor:pointer; color:var(--danger);" onclick="removeFileFromList(this, '${res.url}')"></i>
                        `;
                    } else {
                        document.getElementById(statusId).innerHTML = `<span style="color:var(--danger);">Hata!</span>`;
                    }
                } catch(e) {
                    document.getElementById(statusId).innerHTML = `<span style="color:var(--danger);">Hata!</span>`;
                }
                lucide.createIcons();
            };
            reader.readAsDataURL(file);
        }
        fileInput.value = ''; // Reset input to allow same file re-selection
    });
}

// EXCEL
function exportToExcel() {
    if(typeof XLSX === 'undefined') { showToast("Yükleniyor...", "error"); return; }
    const ws_data = [["Şirket Adı", "Poliçe Adedi", "Zeyil Adedi", "Net Prim", "Komisyon", "Ürt.Oran"]];
    const summary = {}; let tNet = 0, tKom = 0, tPol = 0, tZeyil = 0;
    policies.forEach(p => {
        const c = p.company || 'DİĞER';
        if (!summary[c]) summary[c] = { p: 0, z: 0, n: 0, k: 0 };
        if ((p.ek_no || 0) > 0) { summary[c].z++; tZeyil++; } else { summary[c].p++; tPol++; }
        summary[c].n += p.net_premium; summary[c].k += p.commission; tNet += p.net_premium; tKom += p.commission;
    });
    Object.entries(summary).sort((a, b) => a[0].localeCompare(b[0])).forEach(([name, s]) => { ws_data.push([name, s.p, s.z, s.n, s.k, tNet > 0 ? parseFloat((s.n/tNet*100).toFixed(2)):0]); });
    ws_data.push(["Toplam", tPol, tZeyil, tNet, tKom, 100], [], ["Poliçe Listesi"], ["Tarih", "Poliçe No", "Müşteri", "Şirket", "Net", "Komisyon", "Durum"]);
    
    [...policies].sort((a,b)=>new Date(a.issue_date)-new Date(b.issue_date)).forEach(p=>{
        ws_data.push([cleanDate(p.issue_date), p.policy_no, p.customer_name, p.company, parseFloat(p.net_premium||0), parseFloat(p.commission||0), p.status]);
    });
    
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rapor");
    XLSX.writeFile(wb, "Rapor_" + cleanDate(new Date()) + ".xlsx");
    showToast("Excel İndirildi", "success");
}

attachUiEvents();
init();


function logout() {
    sessionStorage.clear();
    location.reload();
}
