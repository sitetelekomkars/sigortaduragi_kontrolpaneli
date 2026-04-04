let policies = [], users = [], logs = [];
let proposals = JSON.parse(localStorage.getItem('proposals')) || [];
let finance = [];
let settings = { companies: [], branches: [], renewalActions: [], zeyilSubTypes: [] };
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
function cleanDate(d) {
    if(!d) return '';
    try {
        const dt = parseDateAny(d);
        if(isNaN(dt.getTime())) return d.toString();
        const dd = String(dt.getDate()).padStart(2,'0');
        const mm = String(dt.getMonth()+1).padStart(2,'0');
        return `${dd}.${mm}.${dt.getFullYear()}`;
    } catch { return d.toString(); }
}
function formatDateForInput(d) {
    if(!d) return '';
    const dt = parseDateAny(d);
    if(isNaN(dt.getTime())) return '';
    return dt.toISOString().split('T')[0];
}
function parseDateAny(d) {
    if(!d) return new Date(NaN);
    if(d instanceof Date) return d;
    let s = d.toString().trim();
    // Check for DD.MM.YYYY
    if(/^\d{2}\.\d{2}\.\d{4}/.test(s)) {
        const parts = s.split('.');
        return new Date(parts[2], parts[1]-1, parts[0]);
    }
    return new Date(s);
}
function handleStartDateChange() {
    const startEl = document.getElementById('p_start');
    const expiryEl = document.getElementById('p_expiry');
    if(!startEl || !expiryEl || !startEl.value) return;
    const d = new Date(startEl.value);
    if(isNaN(d.getTime())) return;
    d.setFullYear(d.getFullYear() + 1);
    expiryEl.value = d.toISOString().split('T')[0];
}
function fmtCy(v) { return new Intl.NumberFormat('tr-TR', {style:'currency', currency:'TRY'}).format(v||0); }
function showToast(msg, type='info') { const c=document.getElementById('toast-container'); if(!c) return; const t=document.createElement('div'); t.className=`toast ${type}`; t.innerHTML=`<i data-lucide="${type==='error'?'alert-octagon':'check-circle'}"></i><span>${escapeHtml(msg)}</span>`; c.appendChild(t); lucide.createIcons(); setTimeout(()=>t.remove(),4000); }

function normalizeText(v) { return (v ?? '').toString().trim(); }
function toggleNotifPanel() {
    const panel = document.getElementById('notif-panel');
    if (!panel) return;
    panel.classList.toggle('active');
    
    // Close user menu if open
    const userMenu = document.getElementById('user-menu');
    if (userMenu) userMenu.classList.remove('active');
}

function updateNotifications() {
    const list = policies.filter(p => p.status === 'Yaklaşan');
    const badge = document.getElementById('notif-count');
    const panelList = document.getElementById('notif-list');
    const summaryText = document.getElementById('notif-summary');
    
    if (badge) {
        badge.textContent = list.length;
        badge.style.display = list.length > 0 ? 'flex' : 'none';
        
        // Show toast one time per load
        if (list.length > 0 && !window._lastNotifShow) {
            showToast(`${list.length} adet poliçenin vadesi yaklaşıyor!`, 'info');
            window._lastNotifShow = true;
        }
    }
    
    if (summaryText) {
        summaryText.textContent = list.length > 0 ? `${list.length} adet vadesi yaklaşan poliçe mevcut` : 'Vadesi yaklaşan poliçe yok';
    }
    
    if (panelList) {
        if (list.length === 0) {
            panelList.innerHTML = `
                <div class="notif-empty">
                    <i data-lucide="bell-off"></i>
                    <p>Henüz yaklaşan bir poliçe bulunmuyor.</p>
                </div>`;
        } else {
            panelList.innerHTML = list.sort((a,b)=>a.days_left - b.days_left).map(p => `
                <div class="notif-item" onclick="showPage('renewals'); toggleNotifPanel();">
                    <span class="notif-title">${escapeHtml(p.customer_name)}</span>
                    <span class="notif-desc">${escapeHtml(p.policy_no)} • ${escapeHtml(p.company)} / ${escapeHtml(p.branch)}</span>
                    <span class="notif-time"><i data-lucide="clock" style="width:12px;"></i> ${p.days_left} Gün Kaldı</span>
                </div>
            `).join('');
        }
        lucide.createIcons();
    }
}

let currentSort = { col: 'expiry_date', asc: true };

function sortPolicies(col) {
    if (currentSort.col === col) {
        currentSort.asc = !currentSort.asc;
    } else {
        currentSort.col = col;
        currentSort.asc = true;
    }
    renderPolicies();
}

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
    const findField = (aliases) => {
        for(let a of aliases) if(p[a] !== undefined && p[a] !== null) return p[a];
        return null;
    };
    const toISO = (d) => {
        if(!d) return null;
        const dt = parseDateAny(d);
        if(isNaN(dt.getTime())) return d.toString(); 
        return dt.toISOString().split('T')[0];
    };
    return {
        ...p,
        id: p.id || p.ID || Date.now() + Math.random(),
        status: normalizeText(findField(['status', 'durum'])) || 'Aktif',
        issue_date: toISO(findField(['issue_date', 'issueDate', 'tanzim_tarihi', 'tanzim'])),
        start_date: toISO(findField(['start_date', 'startDate', 'police_baslangic', 'baslangic_tarihi', 'issue_date'])),
        expiry_date: toISO(findField(['expiry_date', 'expiryDate', 'police_bitis', 'vade', 'bitis_tarihi'])),
        policy_no: normalizeText(findField(['policy_no', 'police_no', 'police', 'policyNumber'])),
        customer_name: normalizeText(findField(['customer_name', 'musteri', 'customer', 'musteri_ad_soyad', 'unvan'])),
        customer_id: normalizeText(findField(['customer_id', 'tc_vkn', 'tc', 'vkn', 'tc_no', 'vkn_no'])),
        phone: digitsOnly(findField(['phone', 'telefon', 'tel', 'gsm'])),
        birth_date: toISO(findField(['birth_date', 'dogum_tarihi'])),
        ek_no: parseInt(findField(['ek_no', 'ekno', 'ekNo']) ?? 0, 10) || 0,
        region: normalizeText(findField(['region', 'bolge'])),
        company: normalizeText(findField(['company', 'sirket', 'company_name'])),
        branch: normalizeText(findField(['branch', 'brans', 'branch_name'])),
        description: normalizeText(findField(['description', 'aciklama', 'plaka'])),
        net_premium: parseAmount(findField(['net_premium', 'net', 'netPrim'])),
        gross_premium: parseAmount(findField(['gross_premium', 'gross', 'brut_prim', 'brutPrim'])),
        commission: parseAmount(findField(['commission', 'komisyon'])),
        notes: normalizeText(findField(['notes', 'note', 'notlar'])),
        doc_url: normalizeText(findField(['doc_url', 'document_url', 'evrak_url', 'drive_url'])),
        plate_serial: normalizeText(findField(['plate_serial', 'ruhsat_seri_no', 'seri_no', 'ruhsat_no'])),
        zeyil_subtype: normalizeText(findField(['zeyil_subtype', 'zeyil_alt_baslik', 'zeyil_turu']))
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
    document.getElementById('p_birth').value = '';
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

    const ekNo = document.getElementById('p_ek');
    if(ekNo && ekNo.dataset.bound !== '1') {
        const toggleZeyil = () => {
            const val = parseInt(ekNo.value) || 0;
            const group = document.getElementById('zeyil-subtype-group');
            if(group) group.style.display = val > 0 ? 'block' : 'none';
        };
        ekNo.addEventListener('input', toggleZeyil);
        // Also call on load to set initial state if editing
        toggleZeyil();
        ekNo.dataset.bound = '1';
    }
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
    checkAdminUI(); // Initial check based on localStorage data to prevent flash
    await loadData();
    checkAdminUI(); // Re-check after server data sync
}

function checkAdminUI() {
    if (!currentUser) return;
    const isAdmin = currentUser.role.toLowerCase() === 'admin';
    const perms = (currentUser.permissions || 'all').split(',');
    
    // Hide sidebar items not in permissions (if not admin)
    document.querySelectorAll('.nav-item').forEach(el => {
        const pg = el.getAttribute('data-page');
        if (isAdmin || currentUser.permissions === 'all' || perms.includes(pg)) {
            el.style.display = 'flex';
        } else {
            el.style.display = 'none';
        }
    });

    // Handle separate admin-only elements
    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = isAdmin ? 'flex' : 'none';
    });

    // Hide specific action buttons if no permission
    const addBtn = document.querySelector('button[onclick*="policy-drawer"]');
    if (addBtn) addBtn.style.display = hasPermission('action_add_policy') ? 'flex' : 'none';
    
    const exportBtn = document.querySelector('button[onclick*="exportToExcel"]');
    if (exportBtn) exportBtn.style.display = hasPermission('action_export_excel') ? 'flex' : 'none';
}

function hasPermission(perm) {
    if (!currentUser) return false;
    if (currentUser.role.toLowerCase() === 'admin') return true;
    if (currentUser.permissions === 'all') return true;
    const perms = (currentUser.permissions || '').split(',');
    return perms.includes(perm);
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
            } else if(res.status === "2fa_setup_required") {
                show2FASetupScreen(res.username, rawP);
                showToast("2FA Kurulumu Gerekli", "warning");
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
        }
    });
}

const finalizeBtn = document.getElementById('btn-finalize-2fa');
if(finalizeBtn) {
    finalizeBtn.addEventListener('click', async () => {
        const screen = document.getElementById('2fa-setup-screen');
        const code = document.getElementById('setup-2fa-verify-code').value;
        const username = screen.dataset.username;
        const secret = screen.dataset.secret;
        const isDefaultPass = screen.dataset.rawP === "123456";

        if(code.length !== 6) { showToast("Lütfen 6 haneli kodu girin.", "warning"); return; }
        
        finalizeBtn.disabled = true;
        finalizeBtn.innerHTML = '<i class="spin-icon" data-lucide="loader-2"></i> Doğrulanıyor...';
        lucide.createIcons();

        try {
            const res = await fetch(gasUrl, {
                method: 'POST',
                body: JSON.stringify({ action: "verify2FA", username: username, code: code, apiKey: sdApiKey })
            }).then(r => r.json());

            if(res.status === "success") {
                // Success -> also update 'two_fa_required' to false since they just did it
                await fetch(gasUrl, {
                    method: 'POST',
                    body: JSON.stringify({ 
                        action: 'saveUser', 
                        apiKey: sdApiKey, 
                        sessionToken: res.sessionToken, 
                        data: { username: username, two_fa_required: false } 
                    })
                });

                screen.style.display = 'none';
                handleLoginSuccess(res.user, isDefaultPass, res.sessionToken);
            } else {
                showToast(res.message || "Geçersiz kod!", "error");
            }
        } catch(e) {
            showToast("Bağlantı hatası!", "error");
        } finally {
            finalizeBtn.disabled = false;
            finalizeBtn.textContent = 'Kurulumu Tamamla ve Giriş Yap';
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
    const tempToken = sessionStorage.getItem('temp_token') || '';
    
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
            redirect: 'follow',
            body:JSON.stringify({
                action:"saveUser", 
                apiKey: sdApiKey,
                sessionToken: tempToken,
                data: { 
                    username: tempUser.username, 
                    password_hash: hashedP,
                    force_password_change: false 
                }
            })
        });

        const result = await response.json();
        if (result.status !== 'success') {
            showToast("Şifre güncellenemedi: " + (result.message || "Sunucu hatası"), "error");
            return;
        }
        
        // Success — move to the main app
        localStorage.setItem('user', JSON.stringify(tempUser));
        if (tempToken) {
            localStorage.setItem('sessionToken', tempToken);
            sessionToken = tempToken;
        }
        sessionStorage.removeItem('temp_user');
        sessionStorage.removeItem('temp_token');
        currentUser = tempUser;
        await logAction('SIFRE_DEGISIM', 'Kullanıcı şifresini güncelledi');
        showToast("Şifreniz başarıyla güncellendi.", "success");
        attachUiEvents();
        init();
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
    if (!currentUser) return;
    const isAdmin = currentUser.role.toLowerCase() === 'admin';
    const perms = (currentUser.permissions || 'all').split(',');
    
    // Permission Check
    if (!isAdmin && currentUser.permissions !== 'all' && !perms.includes(id)) {
        showToast("Bu sayfaya erişim yetkiniz bulunmuyor.", "error");
        return;
    }

    document.querySelectorAll('.nav-item').forEach(n => {
        n.classList.remove('active');
        if(n.getAttribute('data-page') === id) n.classList.add('active');
    });
    document.querySelectorAll('.page-section').forEach(p=>p.classList.remove('active'));
    
    const target = document.getElementById(id);
    if(target) {
        target.classList.add('active');
        // Reset scroll to top of main content
        const pageContent = document.getElementById('page-content');
        if(pageContent) pageContent.scrollTop = 0;
    }

    document.getElementById('user-menu').classList.remove('active'); // Close menu on navigation
    const sidebar = document.querySelector('.sidebar');
    if(sidebar) sidebar.classList.remove('active'); // Close mobile sidebar
    
    if(id === 'dashboard') { renderKpis(); renderCharts(); }
    if(id === 'policies') renderPolicies();
    if(id === 'zeyiller') renderZeyiller();
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
    if(id === 'birthdays') renderBirthdays();
    
    logAction('SAYFA_GECIS', id);
}

async function show2FASetupScreen(username, rawP) {
    document.getElementById('login-screen').style.display = 'none';
    const screen = document.getElementById('2fa-setup-screen');
    screen.style.display = 'flex';
    screen.dataset.username = username;
    screen.dataset.rawP = rawP;
    
    const qrContainer = document.getElementById('login-qr-container');
    qrContainer.innerHTML = '<i class="spin-icon" data-lucide="loader-2"></i>';
    lucide.createIcons();

    try {
        const res = await fetch(gasUrl, {
            method: 'POST',
            body: JSON.stringify({ action: 'setup2FA', username: username, apiKey: sdApiKey })
        }).then(r => r.json());
        
        if(res.status === 'success') {
            qrContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(res.qrUrl)}" alt="QR Code" style="width:200px; height:200px;">`;
            // Store secret for verification
            screen.dataset.secret = res.secret;
        }
    } catch(e) {
        showToast("QR Kod yüklenemedi", "error");
    }
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

// ======================== PERMISSIONS MGMT ======================== //
function openPermissions(username) {
    if (currentUser.role.toLowerCase() !== 'admin') {
        showToast("Yetkisiz işlem!", "error");
        return;
    }
    const user = users.find(u => u.username === username);
    if(!user) return;
    
    document.getElementById('perm-username').value = username;
    document.getElementById('perm-user-title').textContent = user.full_name || user.username;
    document.getElementById('perm-user-role').textContent = (user.role || 'USER').toUpperCase();
    
    const perms = (user.permissions || 'all').split(',');
    const checkboxes = document.querySelectorAll('#form-permissions input[name="perm"]');
    
    checkboxes.forEach(cb => {
        if (cb.value === 'two_fa_required') {
            cb.checked = (user.two_fa_required === true || user.two_fa_required === 'TRUE');
        } else if(user.permissions === 'all' || perms.includes(cb.value)) {
            cb.checked = true;
        } else {
            cb.checked = false;
        }
    });
    
    openDrawer('permissions-drawer');
}

const formPerms = document.getElementById('form-permissions');
if(formPerms) {
    formPerms.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('perm-username').value;
        const selected = Array.from(document.querySelectorAll('#form-permissions input[name="perm"]:checked')).map(cb => cb.value);
        
        const twoFaRequired = selected.includes('two_fa_required');
        const permsOnly = selected.filter(p => p !== 'two_fa_required');
        const permString = permsOnly.length === 16 ? 'all' : permsOnly.join(','); // 16 without 2fa_req
        
        const btn = formPerms.querySelector('button[type="submit"]');
        btn.disabled = true;
        
        try {
            const res = await fetch(gasUrl, {
                method: 'POST',
                body: JSON.stringify({ 
                    action: 'saveUser', 
                    apiKey: sdApiKey, 
                    sessionToken: sessionToken, 
                    data: { 
                        username: username, 
                        permissions: permString,
                        two_fa_required: twoFaRequired
                    } 
                })
            }).then(r=>r.json());
            
            if(res.status === 'success') {
                showToast("Yetkiler güncellendi.", "success");
                closeAllDrawers();
                loadData();
            }
        } catch(e) { showToast("Kaydedilemedi", "error"); }
        finally { btn.disabled = false; }
    });
}

function renderLogsTable() {
    const container = document.getElementById('table-logs');
    if(!container) return;
    container.innerHTML = logs.map(l => {
        let dateVal = l.dt || l.timestamp;
        let displayDate = dateVal || '---';
        
        if (dateVal) {
            const dateStr = dateVal.toString().trim();
            // If it already looks like dd.mm.yyyy (Turkish format), trust it as-is to avoid shifts
            if (dateStr.match(/^\d{2}\.\d{2}\.\d{4}/)) {
                displayDate = dateStr;
            } else {
                // Handle ISO or other formats from the server/local cache
                try {
                    const d = new Date(dateVal);
                    if (!isNaN(d.getTime())) {
                        displayDate = d.toLocaleString('tr-TR');
                    }
                } catch(e) {}
            }
        }

        return `
            <tr>
                <td><small>${displayDate}</small></td>
                <td><strong>${l.user||l.username}</strong></td>
                <td><span class="badge badge-neutral" style="font-size:0.65rem;">${(l.act||l.action || 'İŞLEM').toUpperCase()}</span></td>
                <td><small style="color:var(--text-muted);">${l.detail||l.details||'-'}</small></td>
            </tr>
        `;
    }).join('');
}

function renderUsersTable() {
    const container = document.getElementById('table-users');
    if(!container) return;
    
    const isAdmin = currentUser.role.toLowerCase() === 'admin';
    const displayList = isAdmin ? users : users.filter(u => u.username === currentUser.username);

    container.innerHTML = displayList.map(u => `
        <tr>
            <td><strong>${u.full_name || u.name || '-'}</strong></td>
            <td><code>${u.username}</code></td>
            <td><span class="badge badge-primary">${u.role.toUpperCase()}</span></td>
            <td>
                <div style="display:flex; gap:5px;">
                    ${isAdmin ? `<button class="btn btn-outline" style="padding:4px 8px; font-size:0.75rem; color:var(--primary);" title="Yetkiler" onclick="openPermissions('${u.username}')"><i data-lucide="shield-check" style="width:14px;"></i></button>` : ''}
                    <button class="btn btn-outline" style="padding:4px 8px;" title="Düzenle" onclick="openEditUser('${u.username}')"><i data-lucide="edit" style="width:14px;"></i></button>
                    <button class="btn btn-outline" style="padding:4px 8px; color:var(--warning);" title="Şifre Sıfırla" onclick="resetUserPassword('${u.username}')"><i data-lucide="key" style="width:14px;"></i></button>
                </div>
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
    const roleSelect = document.getElementById('u_role');
    if (roleSelect) {
        roleSelect.value = u.role || 'USER';
        roleSelect.disabled = (currentUser.role.toLowerCase() !== 'admin');
    }
    
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

async function resetUserPassword(providedUsername) {
    const username = providedUsername || document.getElementById('u_username').value;
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
        loadData();
    } catch(e) { showToast("İşlem başarısız!", "error"); }
}

async function deleteUser(username) {
    if(!username) return;
    if(!confirm(`${username} kullanıcısını silmek istediğinize emin misiniz?`)) return;
    
    try {
        const res = await fetch(gasUrl, {
            method: 'POST',
            body: JSON.stringify({ action: 'deleteUser', apiKey: sdApiKey, sessionToken: sessionToken, username: username })
        }).then(r=>r.json());
        
        if(res.status === 'success') {
            showToast("Kullanıcı silindi.", "success");
            loadData();
        }
    } catch(e) { showToast("Silenemedi", "error"); }
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

        const username = document.getElementById('u_username').value;
        const existingUser = users.find(u => u.username === username);
        
        const data = {
            username: username,
            full_name: document.getElementById('u_fullname').value,
            // SECURITY: If sender is NOT admin, force the role to remain as-is in the metadata
            role: currentUser.role.toLowerCase() === 'admin' ? document.getElementById('u_role').value : (existingUser ? existingUser.role : 'USER'),
            permissions: existingUser ? (existingUser.permissions || 'all') : 'all'
        };
        
        console.log("Saving User Data:", data);

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
                loadData();
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
    // Immediate clear to be safe
    localStorage.clear();
    sessionStorage.clear();
    
    // Attempt to log the action but don't block on it
    if (sessionToken) {
        logAction('ÇIKIŞ', 'Kullanıcı oturumu kapattı');
    }
    
    // Small timeout to allow the log fetch to start (not wait)
    setTimeout(() => {
        location.reload();
    }, 200);
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
            performLogout();
            return;
        }

        if(Array.isArray(pData)) {
            policies = pData.map(normalizePolicyRecord);
            localStorage.setItem('policies_local', JSON.stringify(policies));
        }
        if(Array.isArray(prData)) proposals = prData.map(p=>({...p, amt: parseAmount(p.amt || p.amount)}));
        if(Array.isArray(uData)) {
            users = uData;
            // SYNC CURRENT USER PERMISSIONS/ROLE
            const updatedMe = users.find(u => u.username === currentUser?.username);
            if (updatedMe) {
                const isChanged = JSON.stringify(updatedMe.permissions) !== JSON.stringify(currentUser.permissions) || updatedMe.role !== currentUser.role;
                currentUser = { ...currentUser, ...updatedMe };
                localStorage.setItem('user', JSON.stringify(currentUser));
                if (isChanged) {
                    showToast("Yetkileriniz güncellendi.", "info");
                    checkAdminUI();
                }
            }
        }
        if(Array.isArray(lData)) logs = lData;
        if(Array.isArray(finData)) finance = finData.map(f=>({...f, amount: parseAmount(f.amount)}));

        if(Array.isArray(sData)) {
            settings.companies = [...new Set(sData.filter(s => normalizeKey(s.type) === 'company').map(s => normalizeText(s.value)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr'));
            settings.branches = [...new Set(sData.filter(s => normalizeKey(s.type) === 'branch').map(s => normalizeText(s.value)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr'));
            settings.renewalActions = [...new Set(sData.filter(s => normalizeKey(s.type) === 'action').map(s => normalizeText(s.value)).filter(Boolean))];
            settings.zeyilSubTypes = [...new Set(sData.filter(s => normalizeKey(s.type) === 'zeyil-subtype').map(s => normalizeText(s.value)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr'));
            if(settings.renewalActions.length === 0) settings.renewalActions = ["Aranmadı", "Arandı / Düşünüyor", "Teklif Verildi", "Yenilendi"];
            updateFormDropdowns();
        }

        computeStatuses();
        updateNotifications();

        populateReportFilters();
        
        const active = document.querySelector('.page-section.active')?.id;
        if(active === 'dashboard') { renderKpis(); renderCharts(); }
        if(active === 'policies') renderPolicies();
        if(active === 'proposals') renderProposals();
        if(active === 'documents') renderDocumentsTable();
        if(active === 'finance') renderFinanceTable();
        if(active === 'settings-mgmt') renderSettingsMgmt();
        if(active === 'commissions') renderCommissionSummary();
        if(active === 'renewals') renderRenewals();
        if(active === 'reports') renderReports();
        if(active === 'birthdays') renderBirthdays();
        
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
    const zSel = document.getElementById('p_zeyil_subtype');
    const filterCompany = normalizeText(fcSel?.value);
    const filterBranch = normalizeText(fbSel?.value);

    const companyOptions = [...new Set([...settings.companies, ...policies.map(p => normalizeText(p.company)).filter(Boolean)])].sort((a,b)=>a.localeCompare(b,'tr'));
    const branchOptions = [...new Set([...settings.branches, ...policies.map(p => normalizeText(p.branch)).filter(Boolean)])].sort((a,b)=>a.localeCompare(b,'tr'));

    if(cSel) cSel.innerHTML = '<option value="">Şirket Seçiniz</option>' + companyOptions.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    if(bSel) bSel.innerHTML = '<option value="">Branş Seçiniz</option>' + branchOptions.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');
    if(zSel) zSel.innerHTML = '<option value="">Alt Başlık Seçin...</option>' + settings.zeyilSubTypes.map(z => `<option value="${escapeHtml(z)}">${escapeHtml(z)}</option>`).join('');
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
        else if(days <= 45) p.status = 'Yaklaşan';
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

let trendChartInstance = null;
function renderCharts() {
    if(!document.getElementById('dashboard') || document.getElementById('dashboard').classList.contains('active') === false) return;
    
    // Chart.js Global Styling Defaults
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.color = document.body.getAttribute('data-theme') === 'dark' ? '#a3aed1' : '#64748b';
    
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#a3aed1' : '#64748b';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

    // Daily Production (Area Chart) - Current Month
    const ctxMonthly = document.getElementById('monthlyChart').getContext('2d');
    if(monthlyChartInstance) monthlyChartInstance.destroy();
    
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    
    const dailyMap = {};
    for (let i = 1; i <= daysInMonth; i++) dailyMap[i] = 0;
    
    policies.forEach(p=>{
        const d = new Date(p.issue_date);
        if(isNaN(d)) return;
        if(d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
            const day = d.getDate();
            dailyMap[day] += (p.net_premium || 0);
        }
    });

    const gradient = ctxMonthly.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(0, 86, 179, 0.4)');
    gradient.addColorStop(1, 'rgba(0, 86, 179, 0)');
    
    monthlyChartInstance = new Chart(ctxMonthly, {
        type: 'line', 
        data: { 
            labels: Object.keys(dailyMap), 
            datasets: [{ 
                label: 'Günlük Üretim (₺)', 
                data: Object.values(dailyMap), 
                borderColor: '#0056b3',
                borderWidth: 3,
                fill: true,
                backgroundColor: gradient,
                tension: 0.4,
                pointBackgroundColor: '#0056b3',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }] 
        },
        options: { 
            responsive:true, 
            maintainAspectRatio:false, 
            plugins: { 
                legend:{display:false},
                tooltip: {
                    backgroundColor: isDark ? '#111c44' : '#fff',
                    titleColor: isDark ? '#fff' : '#1a1f36',
                    bodyColor: isDark ? '#a3aed1' : '#697386',
                    borderColor: 'rgba(67, 24, 255, 0.1)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(context.raw);
                        }
                    }
                }
            }, 
            scales: { 
                y:{
                    grid:{color:gridColor, borderDash:[5,5]}, 
                    ticks:{
                        color:textColor,
                        callback: function(v) { return v >= 1000 ? (v/1000) + 'k' : v; }
                    }
                }, 
                x:{
                    grid:{display:false}, 
                    ticks:{color:textColor, maxRotation:0, autoSkip:true, maxTicksLimit:15} 
                } 
            } 
        }
    });

    // Branch Distribution
    const ctxBranch = document.getElementById('branchChart').getContext('2d');
    if(branchChartInstance) branchChartInstance.destroy();
    const branchMap = {};
    policies.forEach(p=>{ const b = p.branch || 'Diğer'; branchMap[b] = (branchMap[b]||0) + p.net_premium; });

    branchChartInstance = new Chart(ctxBranch, {
        type: 'doughnut', 
        data: { 
            labels: Object.keys(branchMap), 
            datasets: [{ 
                data: Object.values(branchMap), 
                backgroundColor: ['#0056b3', '#28a745', '#dc3545', '#ffc107', '#6f42c1','#17a2b8'],
                borderWidth: 0,
                hoverOffset: 15
            }] 
        },
        options: { 
            responsive:true, 
            maintainAspectRatio:false, 
            plugins: { 
                legend: { 
                    position:'bottom', 
                    labels: {
                        color:textColor, 
                        font:{size:10, weight:'bold'}, 
                        boxWidth:8,
                        usePointStyle: true,
                        padding: 15
                    } 
                },
                tooltip: {
                    backgroundColor: isDark ? '#111c44' : '#fff',
                    titleColor: isDark ? '#fff' : '#1a1f36',
                    bodyColor: isDark ? '#a3aed1' : '#697386',
                    borderColor: 'rgba(67, 24, 255, 0.1)',
                    borderWidth: 1,
                    padding: 10
                }
            }, 
            cutout:'75%',
            spacing: 5
        }
    });

    // Annual Trend (Yearly)
    const ctxTrend = document.getElementById('trendChart').getContext('2d');
    if(trendChartInstance) trendChartInstance.destroy();
    
    const yearlyTrend = Array(12).fill(0);
    const curYear = new Date().getFullYear();
    policies.forEach(p => {
        const d = new Date(p.issue_date);
        if(d.getFullYear() === curYear) yearlyTrend[d.getMonth()] += p.net_premium;
    });

    const yearlyGradient = ctxTrend.createLinearGradient(0, 0, 0, 300);
    yearlyGradient.addColorStop(0, 'rgba(5, 205, 153, 0.3)');
    yearlyGradient.addColorStop(1, 'rgba(5, 205, 153, 0)');

    trendChartInstance = new Chart(ctxTrend, {
        type: 'line',
        data: {
            labels: ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'],
            datasets: [{ 
                label: `${curYear} Üretim`, 
                data: yearlyTrend, 
                borderColor: '#0056b3', 
                borderWidth: 3,
                backgroundColor: yearlyGradient, 
                fill: true, 
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#0056b3',
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 3
            }]
        },
        options: { 
            responsive:true, 
            maintainAspectRatio:false, 
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: { 
                legend:{display:false},
                tooltip: {
                    backgroundColor: isDark ? '#111c44' : '#fff',
                    titleColor: isDark ? '#fff' : '#1a1f36',
                    bodyColor: isDark ? '#a3aed1' : '#697386',
                    borderColor: 'rgba(5, 205, 153, 0.1)',
                    borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                            return '₺' + context.raw.toLocaleString('tr-TR');
                        }
                    }
                }
            }, 
            scales: { 
                y:{
                    grid:{color:gridColor, borderDash:[5,5]}, 
                    ticks:{color:textColor, callback: v => '₺' + v.toLocaleString('tr-TR')}
                }, 
                x:{grid:{display:false}, ticks:{color:textColor}} 
            } 
        }
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
    let list = policies.filter(p => !p.ek_no || p.ek_no === 0);
    const headerTitle = document.querySelector('#policies .panel-header h2');
    const totalBadge = document.getElementById('policy-total-count');

    list = applyPolicyFilters(list);

    // Sorting logic
    list.sort((a, b) => {
        let valA = a[currentSort.col];
        let valB = b[currentSort.col];
        if (currentSort.col.includes('date') || currentSort.col === 'issue_date') {
            const dateA = valA ? new Date(valA.split('.').reverse().join('-')) : new Date(0);
            const dateB = valB ? new Date(valB.split('.').reverse().join('-')) : new Date(0);
            return currentSort.asc ? dateA - dateB : dateB - dateA;
        }
        else if (currentSort.col.includes('premium')) {
            const numA = parseFloat(valA) || 0;
            const numB = parseFloat(valB) || 0;
            return currentSort.asc ? numA - numB : numB - numA;
        }
        else {
            valA = String(valA || "").toLocaleLowerCase('tr-TR');
            valB = String(valB || "").toLocaleLowerCase('tr-TR');
            if (valA < valB) return currentSort.asc ? -1 : 1;
            if (valA > valB) return currentSort.asc ? 1 : -1;
            return 0;
        }
    });

    if (totalBadge) totalBadge.textContent = `${list.length} Poliçe`;

    if (headerTitle) {
        if (currentPolicyFilter) headerTitle.innerHTML = `Poliçeler (${currentPolicyFilter}) <button class="btn btn-outline" style="padding:2px 8px; font-size:0.7rem; margin-left:10px;" onclick="currentPolicyFilter=null; renderPolicies();">Tümünü Göster</button>`;
        else headerTitle.textContent = "Poliçe Yönetimi";
    }

    const tbody = document.getElementById('table-policies');
    if(!tbody) return;

    if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="11"><div class="empty-state">Kriterlere uygun poliçe bulunamadı.</div></td></tr>`;
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
        <td><span style="color:var(--primary); font-weight:600; font-size:0.85rem;">${escapeHtml(p.description || '-')}</span></td>
        <td><small style="color:var(--text-muted); font-weight:500;">${escapeHtml(p.plate_serial || '-')}</small></td>
        <td><strong>${fmtCy(p.gross_premium)}</strong></td>
        <td><strong>${fmtCy(p.net_premium)}</strong></td>
        <td>
            <div class="table-actions">
                <button class="btn btn-outline" style="padding:6px 12px; color:var(--success); border-color:rgba(40,167,69,0.2);" onclick="openZeyilForPolicy('${escapeHtml(String(p.id))}')" title="Zeyil Ekle"><i data-lucide="file-plus" style="width:16px;"></i></button>
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

function renderZeyiller() {
    let list = policies.filter(p => p.ek_no && p.ek_no > 0);
    const totalBadge = document.getElementById('zeyil-total-count');

    list = applyPolicyFilters(list);

    // Sort by newest first
    list.sort((a,b) => new Date(b.issue_date || 0) - new Date(a.issue_date || 0));

    if (totalBadge) totalBadge.textContent = `${list.length} Zeyil`;

    const tbody = document.getElementById('table-zeyiller');
    if(!tbody) return;

    if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">Henüz bir zeyil işlemi bulunmuyor.</div></td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(p => `<tr>
        <td><span class="badge badge-neutral">${escapeHtml(p.zeyil_subtype || 'Zeyil')}</span></td>
        <td><strong>${escapeHtml(p.policy_no)}</strong></td>
        <td><span class="badge badge-primary">EK: ${p.ek_no}</span></td>
        <td><small style="color:var(--text-muted)">${escapeHtml(p.description || '-')}</small></td>
        <td><small style="color:var(--primary); font-weight:700;">${escapeHtml(p.plate_serial || '-')}</small></td>
        <td><strong>${escapeHtml(p.customer_name)}</strong></td>
        <td>${cleanDate(p.expiry_date)}</td>
        <td><small>${p.days_left} Gün</small></td>
        <td><strong>${fmtCy(p.gross_premium)}</strong></td>
        <td>${fmtCy(p.commission)}</td>
        <td>
            <div class="table-actions">
                <button class="btn btn-outline" style="padding:6px 12px; color:var(--success); border-color:rgba(40,167,69,0.2);" onclick="openZeyilForPolicy('${escapeHtml(String(p.id))}')" title="Zeyil Ekle"><i data-lucide="file-plus" style="width:16px;"></i></button>
                <button class="btn btn-outline" style="padding:6px 12px;" onclick="showDetails('${escapeHtml(String(p.id))}')" title="Düzenle"><i data-lucide="edit-3" style="width:16px;"></i></button>
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
    
    const year = document.getElementById('filter-finance-year')?.value;
    const month = document.getElementById('filter-finance-month')?.value;
    
    const filtered = finance.filter(f => {
        const d = new Date(f.date);
        if(isNaN(d.getTime())) return true; // Show invalid dates for safety
        const matchesYear = !year || d.getFullYear().toString() === year;
        const matchesMonth = !month || month === 'all' || d.getMonth().toString() === month;
        return matchesYear && matchesMonth;
    });

    tbody.innerHTML = filtered.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(f => `
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
    document.getElementById('list-companies').innerHTML = [...settings.companies].sort((a,b)=>a.localeCompare(b,'tr')).map(c => `
        <tr><td>${c}</td><td style="text-align:right;"><button class="btn btn-outline" style="padding:2px 5px; color:var(--danger);" onclick="deleteSetting('company', '${c}')"><i data-lucide="trash-2" style="width:12px;"></i></button></td></tr>
    `).join('');
    document.getElementById('list-branches').innerHTML = [...settings.branches].sort((a,b)=>a.localeCompare(b,'tr')).map(b => `
        <tr><td>${b}</td><td style="text-align:right;"><button class="btn btn-outline" style="padding:2px 5px; color:var(--danger);" onclick="deleteSetting('branch', '${b}')"><i data-lucide="trash-2" style="width:12px;"></i></button></td></tr>
    `).join('');
    document.getElementById('list-actions').innerHTML = [...settings.renewalActions].sort((a,b)=>a.localeCompare(b,'tr')).map(a => `
        <tr><td>${a}</td><td style="text-align:right;"><button class="btn btn-outline" style="padding:2px 5px; color:var(--danger);" onclick="deleteSetting('action', '${a}')"><i data-lucide="trash-2" style="width:12px;"></i></button></td></tr>
    `).join('');
    document.getElementById('list-zeyil-subtypes').innerHTML = [...settings.zeyilSubTypes].map(z => `
        <tr><td>${z}</td><td style="text-align:right;"><button class="btn btn-outline" style="padding:2px 5px; color:var(--danger);" onclick="deleteSetting('zeyil-subtype', '${z}')"><i data-lucide="trash-2" style="width:12px;"></i></button></td></tr>
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

async function deletePolicy(id) {
    if (!hasPermission('action_delete_policy')) {
        showToast("Poliçe silme yetkiniz bulunmuyor.", "error");
        return;
    }
    if(!confirm("Bu poliçeyi tamamen silmek istediğinize emin misiniz? Bu işlem geri alınamaz.")) return;
    try {
        await fetch(gasUrl, {
            method: 'POST',
            body: JSON.stringify({ action: 'deletePolicy', id, apiKey: sdApiKey, sessionToken: sessionToken })
        });
        loadData();
    } catch(e) { showToast("Hata","error"); }
}

function renderCommissionSummary() {
    const summary = {};
    let totalCommission = 0;
    let totalNet = 0;
    let totalCount = 0;

    policies.forEach(p => {
        if(!summary[p.branch]) summary[p.branch] = { count: 0, net: 0, comm: 0 };
        summary[p.branch].count++;
        summary[p.branch].net += p.net_premium;
        summary[p.branch].comm += p.commission;
        totalCommission += p.commission;
        totalNet += p.net_premium;
        totalCount++;
    });

    const tbody = document.getElementById('table-commission-summary');
    if(!tbody) return;

    const sortedBranches = Object.keys(summary).sort();
    tbody.innerHTML = sortedBranches.map(b => {
        const ratio = totalCommission > 0 ? (summary[b].comm / totalCommission * 100).toFixed(1) : 0;
        return `
            <tr>
                <td><strong>${b}</strong></td>
                <td>${summary[b].count} Adet</td>
                <td>${fmtCy(summary[b].net)}</td>
                <td><strong>${fmtCy(summary[b].comm)}</strong></td>
                <td><span class="badge badge-neutral">${ratio}%</span></td>
            </tr>
        `;
    }).join('');

    // Add Total Row
    if (sortedBranches.length > 0) {
        tbody.innerHTML += `
            <tr style="background:var(--primary); color:white; font-weight:700;">
                <td>TOPLAM</td>
                <td>${totalCount} Adet</td>
                <td>${fmtCy(totalNet)}</td>
                <td>${fmtCy(totalCommission)}</td>
                <td>100%</td>
            </tr>
        `;
    }
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
    
    resetPolicyForm();
    
    const fill = () => {
        document.getElementById('p_no').value = p.policy_no || '';
        document.getElementById('p_ek').value = 0;
        document.getElementById('p_customer').value = p.customer_name || '';
        document.getElementById('p_tc').value = p.customer_id || '';
        document.getElementById('p_phone').value = p.phone || '';
        document.getElementById('p_birth').value = formatDateForInput(p.birth_date);
        
        const today = new Date().toISOString().split('T')[0];
        let startVal = today;
        if (p.expiry_date) {
            const d = parseDateAny(p.expiry_date);
            if(!isNaN(d.getTime())) startVal = d.toISOString().split('T')[0];
        }
        
        document.getElementById('p_issue').value = today;
        document.getElementById('p_start').value = startVal;
        
        const expDate = new Date(startVal);
        expDate.setFullYear(expDate.getFullYear() + 1);
        document.getElementById('p_expiry').value = expDate.toISOString().split('T')[0];
        
        document.getElementById('p_net').value = 0;
        document.getElementById('p_gross').value = 0;
        document.getElementById('p_comm').value = 0;
        document.getElementById('p_desc').value = p.description || '';
        document.getElementById('p_note').value = 'YENİLEME';
        document.getElementById('p_doc_url').value = '';
        
        setSelectValue('p_company', p.company, settings.companies);
        setSelectValue('p_branch', p.branch, settings.branches);
        lucide.createIcons();
    };

    const title = document.getElementById('policy-drawer-title');
    const submitBtn = document.getElementById('policy-submit-btn');
    if (title) title.textContent = `Poliçe Yenileme · ${p.policy_no || ''}`;
    if (submitBtn) submitBtn.innerHTML = '<i data-lucide="refresh-cw"></i> Yenilemeyi Kaydet';
    
    openDrawer('policy-drawer');
    fill();
    showToast("Poliçe bilgileri kopyalandı. Lütfen yeni prim miktarını girin.", "success");
}

function renderRenewals() {
    const list = policies.filter(p => { 
        if(!p.expiry_date) return false;
        return p.days_left <= 45;
    }).sort((a,b)=> a.days_left - b.days_left);

    document.getElementById('table-renewals').innerHTML = list.map(p => {
        let text = p.days_left < 0 ? `${Math.abs(p.days_left)} Gün Geçti` : `${p.days_left} Gün Kaldı`;
        const options = settings.renewalActions.length > 0 ? settings.renewalActions : ["Aranmadı", "Arandı / Düşünüyor", "Teklif Verildi", "Yenilendi"];
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
        if(!cmap[nm]) cmap[nm] = { tc: p.customer_id, phone: p.phone, count: 0, net: 0, latest_policy: p.policy_no };
        cmap[nm].count++; 
        cmap[nm].net += p.net_premium;
        // Keep the latest phone if available
        if (p.phone && (!cmap[nm].phone || cmap[nm].phone.length < 10)) cmap[nm].phone = p.phone;
    });

    document.getElementById('table-customers').innerHTML = Object.entries(cmap).map(([name, d]) => {
        const waPhone = (d.phone || "").replace(/[^0-9]/g, "");
        const waLink = waPhone ? `https://wa.me/90${waPhone.length === 10 ? waPhone : waPhone.slice(-10)}` : null;
        
        return `<tr>
            <td><strong>${name}</strong></td>
            <td>${d.tc||'-'}</td>
            <td>${d.phone||'-'}</td>
            <td><span class="badge badge-primary">${d.count} Poliçe</span></td>
            <td><strong>${fmtCy(d.net)}</strong></td>
            <td>
                <div style="display:flex; gap:5px;">
                    <button class="btn btn-outline" title="Görüntüle" style="padding:4px 8px;" onclick="showCustomerDetails('${name.replace(/'/g, "\\'")}')">
                        <i data-lucide="eye" style="width:14px;"></i>
                    </button>
                    ${waLink ? `
                        <a href="${waLink}" target="_blank" class="btn btn-outline" title="WhatsApp" style="padding:4px 8px; color:#25D366; border-color:#25D366;">
                            <i data-lucide="message-circle" style="width:14px;"></i>
                        </a>
                    ` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');
    lucide.createIcons();
}

function populateReportFilters() {
    const currentYear = new Date().getFullYear();
    const allYears = [...new Set([
        ...policies.map(p => { const d = new Date(p.issue_date); return isNaN(d.getTime()) ? null : d.getFullYear(); }),
        ...finance.map(f => { const d = new Date(f.date); return isNaN(d.getTime()) ? null : d.getFullYear(); })
    ].filter(Boolean))];
    if(!allYears.includes(currentYear)) allYears.push(currentYear);
    allYears.sort((a,b) => b - a);

    const yearSelects = ['filter-report-year', 'filter-finance-year'];
    yearSelects.forEach(id => {
        const el = document.getElementById(id);
        if(!el) return;
        const prevVal = el.value;
        el.innerHTML = allYears.map(y => `<option value="${y}" ${y == currentYear && !prevVal ? 'selected' : ''}>${y}</option>`).join('');
        if(prevVal && allYears.includes(parseInt(prevVal))) el.value = prevVal;
    });
}

function renderReports() {
    const year = document.getElementById('filter-report-year')?.value;
    const month = document.getElementById('filter-report-month')?.value;
    
    const filteredPolicies = policies.filter(p => {
        const d = new Date(p.issue_date);
        if(isNaN(d.getTime())) return false;
        const matchesYear = d.getFullYear().toString() === year;
        const matchesMonth = month === 'all' || d.getMonth().toString() === month;
        return matchesYear && matchesMonth;
    });

    const summary = {}; let tP=0, tZ=0, tN=0, tB=0, tK=0;
    filteredPolicies.forEach(p => {
        const c = p.company || 'DİĞER';
        if (!summary[c]) summary[c] = { p: 0, z: 0, n: 0, b: 0, k: 0 };
        if ((p.ek_no || 0) > 0) { summary[c].z++; tZ++; } else { summary[c].p++; tP++; }
        summary[c].n += p.net_premium;
        summary[c].b += p.gross_premium;
        summary[c].k += p.commission;
        tN += p.net_premium; tB += p.gross_premium; tK += p.commission;
    });

    const tbodyReports = document.getElementById('table-reports');
    if (tbodyReports) {
        tbodyReports.innerHTML = Object.entries(summary).sort((a,b)=>a[0].localeCompare(b[0],'tr')).map(([name, s]) => {
            const ratio = tN > 0 ? (s.n/tN*100).toFixed(1) : 0;
            return `<tr><td><strong>${name}</strong></td><td>${s.p}</td><td>${s.z}</td><td><strong>${fmtCy(s.n)}</strong></td><td>${fmtCy(s.b)}</td><td>${fmtCy(s.k)}</td><td>%${ratio}</td></tr>`;
        }).join('');

        // Add Total Row
        if (Object.keys(summary).length > 0) {
            tbodyReports.innerHTML += `
                <tr style="background:rgba(0, 86, 179, 0.05); font-weight:700; border-top:2px solid var(--primary);">
                    <td>TOPLAM</td>
                    <td>${tP}</td>
                    <td>${tZ}</td>
                    <td>${fmtCy(tN)}</td>
                    <td>${fmtCy(tB)}</td>
                    <td>${fmtCy(tK)}</td>
                    <td>100%</td>
                </tr>
            `;
        }
    }
    renderRawPolicies(filteredPolicies);
}

function renderRawPolicies(filteredData) {
    const tbody = document.getElementById('table-raw-policies');
    if(!tbody) return;
    const dataToRender = filteredData || policies;
    const sorted = [...dataToRender].sort((a,b) => new Date(b.issue_date||0) - new Date(a.issue_date||0));
    tbody.innerHTML = sorted.map(p => `<tr>
        <td><small>${cleanDate(p.issue_date)}</small></td>
        <td><small>${cleanDate(p.start_date)}</small></td>
        <td><small>${cleanDate(p.expiry_date)}</small></td>
        <td><strong>${p.policy_no||'-'}</strong></td>
        <td>${p.customer_name||'-'}</td>
        <td>${p.company||'-'}</td>
        <td><span class="badge badge-neutral" style="font-size:0.65rem;">${p.branch||'-'}</span></td>
        <td><small style="font-weight:600;">${p.description||'-'}</small></td>
        <td><small style="color:var(--text-muted);">${p.plate_serial||'-'}</small></td>
        <td>${fmtCy(p.net_premium)}</td>
        <td>${fmtCy(p.gross_premium)}</td>
        <td><span class="badge ${badgeClass(p.status)}">${p.status}</span></td>
    </tr>`).join('');
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
    const drawer = document.getElementById(id);
    if (!drawer) return;
    drawer.classList.add('open');
    document.getElementById('overlay').classList.add('active');
    lucide.createIcons({ props: { "stroke-width": 2 }, nameAttr: "data-lucide", root: drawer });
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
        <div style="margin-bottom:1.5rem; display:flex; flex-direction:column; gap:12px;">
            <div class="form-group">
                <label>Müşteri Ad Soyad / Ünvan</label>
                <input type="text" id="crm_name" class="form-control" value="${escapeHtml(name)}">
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
                <div class="form-group">
                    <label>TC / VKN</label>
                    <input type="text" id="crm_tc" class="form-control" value="${escapeHtml(p.customer_id || '')}" maxlength="11">
                </div>
                <div class="form-group">
                    <label>Telefon</label>
                    <input type="text" id="crm_phone" class="form-control" value="${escapeHtml(p.phone || '')}" maxlength="11">
                </div>
            </div>
            <button class="btn btn-primary" onclick="saveCustomerChanges('${escapeHtml(name).replace(/'/g, "\\'")}')" style="width:100%;">
                <i data-lucide="check-circle" style="width:16px; margin-right:5px;"></i> Tüm Kayıtları Güncelle
            </button>
        </div>
        <div class="glass-panel" style="margin-bottom:1.5rem; padding:1rem; border-color:var(--success-border); background:rgba(40, 167, 69, 0.05);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span class="stat-label">Toplam Üretim</span>
                <strong style="color:var(--success); font-size:1.2rem;">${fmtCy(totalNet)}</strong>
            </div>
        </div>
    `;
    document.getElementById('customer-profile-content').innerHTML = html;
    
    document.getElementById('customer-policies-list').innerHTML = custPolicies.map(cp => `
        <tr>
            <td><strong>${cp.policy_no}</strong></td>
            <td>${cp.company}</td>
            <td>${cp.branch}</td>
            <td style="white-space:nowrap; color:var(--primary);">${cleanDate(cp.expiry_date)}</td>
        </tr>
    `).join('');
    
    lucide.createIcons();
    openDrawer('customer-drawer');
}

async function saveCustomerChanges(oldName) {
    const newName = document.getElementById('crm_name').value.trim();
    const newTC = document.getElementById('crm_tc').value.trim();
    const newPhone = document.getElementById('crm_phone').value.trim();
    
    if(!newName) { showToast("Müşteri adı boş olamaz!", "error"); return; }
    
    const affected = policies.filter(p => p.customer_name === oldName);
    if(affected.length === 0) return;
    
    if(!confirm(`${affected.length} adet poliçe kaydı güncellenecek. Onaylıyor musunuz?`)) return;
    
    showToast("Güncelleniyor...", "info");
    
    try {
        // We send a specialized batch update or just iterate (iterate is safer for UI feedback in this simple GAS setup)
        // For efficiency in GAS, we can add a 'bulkUpdate' action or just do it in a loop if count is small.
        // Actually, let's just use the 'savePolicy' for each to ensure backend consistency.
        
        for (let p of affected) {
            p.customer_name = newName;
            p.customer_id = newTC;
            p.phone = newPhone;
            
            await fetch(gasUrl, {
                method: 'POST',
                body: JSON.stringify({ action: "savePolicy", apiKey: sdApiKey, sessionToken: sessionToken, data: p })
            });
        }
        
        showToast("Tüm kayıtlar başarıyla güncellendi.", "success");
        closeAllDrawers();
        loadData();
    } catch(e) {
        showToast("Bir hata oluştu!", "error");
    }
}

function updateFormDropdowns() {
    const pCompany = document.getElementById('p_company');
    const pBranch = document.getElementById('p_branch');
    const pZeyil = document.getElementById('p_zeyil_subtype');
    
    if (pCompany) pCompany.innerHTML = `<option value="">Şirket Seçiniz</option>` + settings.companies.map(c => `<option value="${c}">${c}</option>`).join('');
    if (pBranch) pBranch.innerHTML = `<option value="">Branş Seçiniz</option>` + settings.branches.map(b => `<option value="${b}">${b}</option>`).join('');
    if (pZeyil) pZeyil.innerHTML = `<option value="">Alt Başlık Seçin...</option>` + settings.zeyilSubTypes.map(z => `<option value="${z}">${z}</option>`).join('');
}

function setSelectValue(id, val, list) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = (id === 'p_zeyil_subtype' ? `<option value="">Alt Başlık Seçin...</option>` : `<option value="">${id === 'p_company' ? 'Şirket' : 'Branş'} Seçiniz</option>`) + 
        list.map(x => `<option value="${x}" ${x === val ? 'selected' : ''}>${x}</option>`).join('');
    el.value = val || '';
}

function resetPolicyForm() {
    const f = document.getElementById('form-policy');
    if (f) f.reset();
    delete document.getElementById('form-policy').dataset.updateId;
    const fileContainer = document.getElementById('file-list-container');
    if(fileContainer) fileContainer.innerHTML = '';
}

function showDetails(id) {
    const p = normalizePolicyRecord(policies.find(x => x.id == id) || {}); if(!p.id) return;
    updateFormDropdowns();

    document.getElementById('p_no').value = p.policy_no || '';
    document.getElementById('p_ek').value = p.ek_no || 0;
    document.getElementById('p_customer').value = p.customer_name || '';
    document.getElementById('p_tc').value = p.customer_id || '';
    document.getElementById('p_phone').value = p.phone || '';
    document.getElementById('p_birth').value = formatDateForInput(p.birth_date);
    
    document.getElementById('p_issue').value = formatDateForInput(p.issue_date);
    document.getElementById('p_start').value = formatDateForInput(p.start_date);
    document.getElementById('p_expiry').value = formatDateForInput(p.expiry_date);
    
    document.getElementById('p_net').value = p.net_premium || 0;
    document.getElementById('p_gross').value = p.gross_premium || 0;
    document.getElementById('p_comm').value = p.commission || 0;
    document.getElementById('p_desc').value = p.description || '';
    document.getElementById('p_plate_serial').value = p.plate_serial || '';
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

function openNewPolicyDrawer() {
    resetPolicyForm();
    updateFormDropdowns();
    
    // Default dates
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('p_issue').value = today;
    document.getElementById('p_start').value = today;
    
    const title = document.getElementById('policy-drawer-title');
    const submitBtn = document.getElementById('policy-submit-btn');
    if (title) title.textContent = "Yeni Poliçe";
    if (submitBtn) submitBtn.innerHTML = '<i data-lucide="plus"></i> Kaydet';
    
    const zeyilDiv = document.getElementById('zeyil-subtype-group');
    if (zeyilDiv) zeyilDiv.style.display = 'none';
    
    const fileContainer = document.getElementById('file-list-container');
    if(fileContainer) fileContainer.innerHTML = '';
    
    openDrawer('policy-drawer');
    lucide.createIcons();
}

// Auto-toggle zeyil subtype visibility when Ek No changes
const pEkInput = document.getElementById('p_ek');
if (pEkInput) {
    pEkInput.addEventListener('input', (e) => {
        const val = parseInt(e.target.value) || 0;
        const zeyilDiv = document.getElementById('zeyil-subtype-group');
        if (zeyilDiv) {
            zeyilDiv.style.display = (val > 0) ? 'block' : 'none';
        }
    });
}

function openZeyilForPolicy(id) {
    const p = policies.find(x => x.id == id);
    if (!p) return;
    
    // Find current max EK for this policy number
    const related = policies.filter(x => x.policy_no === p.policy_no);
    const maxEk = related.reduce((max, x) => Math.max(max, parseInt(x.ek_no || 0)), 0);
    const nextEk = maxEk + 1;

    updateFormDropdowns();
    
    // Auto-fill existing policy data
    document.getElementById('p_no').value = p.policy_no || '';
    document.getElementById('p_ek').value = nextEk;
    document.getElementById('p_customer').value = p.customer_name || '';
    document.getElementById('p_tc').value = p.customer_id || '';
    document.getElementById('p_phone').value = p.phone || '';
    document.getElementById('p_birth').value = formatDateForInput(p.birth_date);
    
    // Reset specific zeyil data (today's dates)
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('p_issue').value = today;
    document.getElementById('p_start').value = today;
    document.getElementById('p_expiry').value = formatDateForInput(p.expiry_date);
    
    // Clear financial data
    document.getElementById('p_net').value = 0;
    document.getElementById('p_gross').value = 0;
    document.getElementById('p_comm').value = 0;
    document.getElementById('p_desc').value = p.description || '';
    document.getElementById('p_plate_serial').value = p.plate_serial || '';
    document.getElementById('p_note').value = '';
    document.getElementById('p_doc_url').value = '';
    
    setSelectValue('p_company', p.company, settings.companies);
    setSelectValue('p_branch', p.branch, settings.branches);

    // Show Zeyil Sub-Type Group if Ek > 0
    const zeyilDiv = document.getElementById('zeyil-subtype-group');
    if (zeyilDiv) zeyilDiv.style.display = 'block';

    const fileContainer = document.getElementById('file-list-container');
    if(fileContainer) fileContainer.innerHTML = '';

    // Important: No updateId dataset, so it saves as NEW
    delete document.getElementById('form-policy').dataset.updateId;
    
    const title = document.getElementById('policy-drawer-title');
    const submitBtn = document.getElementById('policy-submit-btn');
    if (title) title.textContent = `Zeyil Ekle · ${p.policy_no} (EK:${nextEk})`;
    if (submitBtn) submitBtn.innerHTML = '<i data-lucide="plus"></i> Kaydet';
    
    openDrawer('policy-drawer');
    lucide.createIcons();
}

const formPolicy = document.getElementById('form-policy');
if (formPolicy) {
    formPolicy.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = formPolicy.querySelector('button[type="submit"]');
        const originalText = btn.textContent;
        const updateId = formPolicy.dataset.updateId;
        
        if (updateId && !hasPermission('action_edit_policy')) {
            showToast("Poliçe düzenleme yetkiniz bulunmuyor.", "error");
            btn.disabled = false;
            btn.textContent = originalText;
            return;
        }
        if (!updateId && !hasPermission('action_add_policy')) {
            showToast("Yeni poliçe ekleme yetkiniz bulunmuyor.", "error");
            btn.disabled = false;
            btn.textContent = originalText;
            return;
        }
        
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
            birth_date: document.getElementById('p_birth').value,
            ek_no: parseInt(document.getElementById('p_ek').value) || 0,
            region: "", // Şimdilik boş
            company: document.getElementById('p_company').value,
            branch: document.getElementById('p_branch').value,
            description: document.getElementById('p_desc').value,
            net_premium: parseAmount(document.getElementById('p_net').value),
            gross_premium: parseAmount(document.getElementById('p_gross').value),
            commission: parseAmount(document.getElementById('p_comm').value),
            notes: document.getElementById('p_note').value,
            doc_url: document.getElementById('p_doc_url').value,
            plate_serial: document.getElementById('p_plate_serial').value,
            zeyil_subtype: document.getElementById('p_zeyil_subtype').value
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
                loadData();
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
                loadData();
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
                            sessionToken: sessionToken,
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
    if (!hasPermission('action_export_excel')) {
        showToast("Rapor indirme yetkiniz bulunmuyor.", "error");
        return;
    }
    if(typeof XLSX === 'undefined') { showToast("XLSX kütüphanesi yüklenmedi!", "error"); return; }
    
    // === FILTRELEME ===
    const year = document.getElementById('filter-report-year')?.value;
    const month = document.getElementById('filter-report-month')?.value;
    const filteredPolicies = policies.filter(p => {
        const d = new Date(p.issue_date);
        if(isNaN(d.getTime())) return false;
        const matchesYear = d.getFullYear().toString() === year;
        const matchesMonth = month === 'all' || d.getMonth().toString() === month;
        return matchesYear && matchesMonth;
    });

    // === SAYFA 1: ÖZET ===
    const summary = {}; let tNet=0, tBrut=0, tKom=0, tPol=0, tZeyil=0;
    filteredPolicies.forEach(p => {
        const c = p.company || 'DİĞER';
        if (!summary[c]) summary[c] = { p:0, z:0, n:0, b:0, k:0 };
        if ((p.ek_no||0) > 0) { summary[c].z++; tZeyil++; } else { summary[c].p++; tPol++; }
        summary[c].n += p.net_premium;
        summary[c].b += p.gross_premium;
        summary[c].k += p.commission;
        tNet += p.net_premium; tBrut += p.gross_premium; tKom += p.commission;
    });

    const ws_ozet = [["Şirket Adı", "Poliçe", "Zeyil", "Net Prim (₺)", "Brüt Prim (₺)", "Komisyon (₺)", "Ürt.Oran (%)"]];
    Object.entries(summary).sort((a,b)=>a[0].localeCompare(b[0],'tr')).forEach(([name, s]) => {
        ws_ozet.push([name, s.p, s.z,
            parseFloat(s.n.toFixed(2)),
            parseFloat(s.b.toFixed(2)),
            parseFloat(s.k.toFixed(2)),
            tNet > 0 ? parseFloat((s.n/tNet*100).toFixed(2)) : 0
        ]);
    });
    ws_ozet.push(["TOPLAM", tPol, tZeyil,
        parseFloat(tNet.toFixed(2)),
        parseFloat(tBrut.toFixed(2)),
        parseFloat(tKom.toFixed(2)),
        100
    ]);

    // === SAYFA 2: HAM VERİ ===
    const ws_ham = [["Tanzim Tarihi","Başlangıç","Bitiş","Poliçe No","Müşteri","TC/VKN","Şirket","Branş (Tür)","Plaka/Açıklama","Net Prim (₺)","Brüt Prim (₺)","Komisyon (₺)","Durum"]];
    [...filteredPolicies].sort((a,b)=>new Date(b.issue_date||0)-new Date(a.issue_date||0)).forEach(p => {
        ws_ham.push([
            cleanDate(p.issue_date),
            cleanDate(p.start_date),
            cleanDate(p.expiry_date),
            p.policy_no || '',
            p.customer_name || '',
            p.customer_id || '',
            p.company || '',
            p.branch || '',
            p.description + (p.plate_serial ? ' / ' + p.plate_serial : ''),
            parseFloat((p.net_premium||0).toFixed(2)),
            parseFloat((p.gross_premium||0).toFixed(2)),
            parseFloat((p.commission||0).toFixed(2)),
            p.status || ''
        ]);
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ws_ozet), "Özet");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ws_ham), "Ham Veri");
    XLSX.writeFile(wb, "Rapor_" + cleanDate(new Date()) + ".xlsx");
    showToast("Excel İndirildi (2 sayfa)", "success");
}

function exportFinanceToExcel() {
    if(typeof XLSX === 'undefined') { showToast("XLSX kütüphanesi yüklenmedi!", "error"); return; }

    const year = document.getElementById('filter-finance-year')?.value;
    const month = document.getElementById('filter-finance-month')?.value;
    const filtered = finance.filter(f => {
        const d = new Date(f.date);
        if(isNaN(d.getTime())) return true;
        const matchesYear = !year || d.getFullYear().toString() === year;
        const matchesMonth = !month || month === 'all' || d.getMonth().toString() === month;
        return matchesYear && matchesMonth;
    });

    const ws_data = [["Tarih", "Tür", "Kategori", "Açıklama", "Tutar (₺)"]];
    filtered.sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(f => {
        ws_data.push([
            cleanDate(f.date),
            f.type,
            f.category,
            f.description || '',
            parseFloat((f.amount || 0).toFixed(2))
        ]);
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ws_data), "Bilanço");
    XLSX.writeFile(wb, "Bilanco_" + cleanDate(new Date()) + ".xlsx");
    showToast("Bilanço Excel İndirildi", "success");
}

function renderBirthdays() {
    const tbody = document.getElementById('table-birthdays');
    if(!tbody) return;
    const today = new Date();
    const todayStr = String(today.getDate()).padStart(2,'0') + '.' + String(today.getMonth()+1).padStart(2,'0');
    const customerMap = {};
    policies.forEach(p => {
        const name = (p.customer_name || "").toString().trim();
        if(!name) return;
        if(!customerMap[name] || new Date(p.issue_date) > new Date(customerMap[name].latest)) {
            customerMap[name] = { name: name, birth_date: p.birth_date, phone: p.phone, latest: p.issue_date, policy: p.policy_no };
        }
    });
    const bdayList = Object.values(customerMap).filter(c => c.birth_date && c.birth_date.startsWith(todayStr));
    document.getElementById('birthday-count').textContent = `${bdayList.length} Kişi`;
    if(bdayList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:3rem; color:var(--text-muted);">Bugün doğum günü olan müşteri bulunamadı.</td></tr>`;
        return;
    }
    tbody.innerHTML = bdayList.map(c => {
        const isBdayToday = true; // They are already filtered for today
        const msg = encodeURIComponent(`Sayın ${c.name}, Sigorta Durağı olarak doğum gününüzü kutlar, sağlıklı ve mutlu yıllar dileriz! 🎂🎈`);
        const waPhone = (c.phone || "").replace(/[^0-9]/g, "");
        const waLink = waPhone ? `https://wa.me/90${waPhone.length === 10 ? waPhone : waPhone.slice(-10)}?text=${msg}` : "#";
        return `<tr class="birthday-glow">
            <td><strong>${c.name}</strong></td>
            <td>${c.birth_date} <span class="badge badge-success" style="font-size:0.6rem; margin-left:5px;">BUGÜN!</span></td>
            <td>${c.phone || '-'}</td>
            <td><small>${c.policy || '-'}</small></td>
            <td>
                <a href="${waLink}" target="_blank" class="btn btn-primary" style="background:#25D366; border-color:#25D366; padding:6px 12px; font-size:0.8rem; box-shadow:0 4px 12px rgba(37, 211, 102, 0.2);">
                    <i data-lucide="message-circle" style="width:14px; margin-right:5px;"></i> Mesaj At (WP)
                </a>
            </td>
        </tr>`;
    }).join('');
    lucide.createIcons();
}


attachUiEvents();
init();
