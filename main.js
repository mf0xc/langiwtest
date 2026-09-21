// ============================================
// مشروع مشاركة المشاعر - حمودي وفوفو
// ============================================

// -- إعدادات Supabase --
const SUPABASE_URL = 'https://nviviicpompmdokkritx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52aXZpaWNwb21wbWRva2tyaXR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMTc3NzQsImV4cCI6MjEwMjc5Mzc3NH0.hqqp-bqejHF7AlGhlfLcoyZ1MEhGGsqkfilZy1gaG6E';

// -- تهيئة Supabase --
// ملاحظة: لا نستخدم اسم "supabase" كمتغير لأنه يتعارض مع window.supabase من الـ SDK
var supabaseClient = null;
var supabaseAvailable = false;

try {
  if (typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function') {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    supabaseAvailable = true;
    console.log('[APP] Supabase initialized successfully');
  } else {
    console.warn('[APP] Supabase SDK not found. Using LocalStorage fallback.');
  }
} catch (err) {
  console.error('[APP] Supabase init failed:', err);
  console.warn('[APP] Using LocalStorage fallback mode.');
}

// -- المتغيرات العامة --
var currentUser = null;
var otherUser = null;
var realtimeChannel = null;

// -- عناصر DOM --
var loginScreen = document.getElementById('login-screen');
var dashboardScreen = document.getElementById('dashboard-screen');
var welcomeText = document.getElementById('welcome-text');
var otherTitle = document.getElementById('other-title');
var otherFeelingText = document.getElementById('other-feeling-text');
var statusTime = document.getElementById('status-time');
var customInput = document.getElementById('custom-feeling-input');
var addCustomBtn = document.getElementById('add-custom-btn');
var toastEl = document.getElementById('success-toast');

// ============================================
// LocalStorage Helpers
// ============================================

function lsGet(key) {
  try {
    var val = localStorage.getItem(key);
    return val ? JSON.parse(val) : null;
  } catch (e) {
    return null;
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('[APP] localStorage error:', e);
  }
}

// ============================================
// شاشة تسجيل الدخول
// ============================================

function initLoginScreen() {
  console.log('[APP] Initializing login screen...');
  var userCards = document.querySelectorAll('.user-card');
  console.log('[APP] Found user cards:', userCards.length);

  for (var i = 0; i < userCards.length; i++) {
    (function(card) {
      card.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var selectedUser = card.getAttribute('data-user');
        console.log('[APP] Card clicked:', selectedUser);
        login(selectedUser);
      });
    })(userCards[i]);
  }
}

function login(userName) {
  console.log('[APP] Logging in as:', userName);
  currentUser = userName;
  otherUser = (userName === 'حمودي') ? 'فوفو' : 'حمودي';

  localStorage.setItem('currentUser', currentUser);

  showScreen('dashboard');

  if (welcomeText) welcomeText.textContent = 'مرحباً ' + currentUser;
  if (otherTitle) otherTitle.textContent = 'حالة ' + otherUser;

  loadMyFeeling();
  loadOtherFeeling();

  if (supabaseAvailable) {
    subscribeToRealtime();
  }
}

function logout() {
  console.log('[APP] Logging out...');
  currentUser = null;
  otherUser = null;
  localStorage.removeItem('currentUser');

  if (realtimeChannel) {
    try { realtimeChannel.unsubscribe(); } catch(e) {}
    realtimeChannel = null;
  }

  var radios = document.querySelectorAll('input[name="feeling"]');
  for (var i = 0; i < radios.length; i++) {
    radios[i].checked = false;
  }
  if (customInput) customInput.value = '';

  showScreen('login');
}

// ============================================
// إدارة الشاشات
// ============================================

function showScreen(screenName) {
  console.log('[APP] Switching to screen:', screenName);
  if (screenName === 'login') {
    if (dashboardScreen) dashboardScreen.classList.remove('active');
    setTimeout(function() {
      if (loginScreen) loginScreen.classList.add('active');
    }, 50);
  } else {
    if (loginScreen) loginScreen.classList.remove('active');
    setTimeout(function() {
      if (dashboardScreen) dashboardScreen.classList.add('active');
    }, 50);
  }
}

// ============================================
// إدارة المشاعر
// ============================================

async function saveFeeling(feeling) {
  if (!currentUser) return;
  console.log('[APP] Saving feeling:', feeling, 'for user:', currentUser);

  if (supabaseAvailable && supabaseClient) {
    try {
      var result = await supabaseClient
        .from('feelings')
        .insert([{ user_name: currentUser, feeling: feeling }]);

      if (result.error) {
        console.error('[APP] Supabase save error:', result.error);
        saveFeelingLocal(feeling);
      } else {
        console.log('[APP] Feeling saved to Supabase');
      }
    } catch (err) {
      console.error('[APP] Supabase exception:', err);
      saveFeelingLocal(feeling);
    }
  } else {
    saveFeelingLocal(feeling);
  }

  showToast('تم تحديث شعورك بنجاح');
  loadOtherFeeling();
}

function saveFeelingLocal(feeling) {
  var data = lsGet('feelings_data') || {};
  data[currentUser] = {
    feeling: feeling,
    created_at: new Date().toISOString()
  };
  lsSet('feelings_data', data);
  console.log('[APP] Feeling saved to LocalStorage');
}

async function loadMyFeeling() {
  if (!currentUser) return;

  if (supabaseAvailable && supabaseClient) {
    try {
      var result = await supabaseClient
        .from('feelings')
        .select('feeling')
        .eq('user_name', currentUser)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!result.error && result.data && result.data.length > 0) {
        selectFeelingInUI(result.data[0].feeling);
        return;
      }
    } catch (err) {
      console.error('[APP] Load my feeling error:', err);
    }
  }

  // Fallback to LocalStorage
  var data = lsGet('feelings_data') || {};
  if (data[currentUser]) {
    selectFeelingInUI(data[currentUser].feeling);
  }
}

async function loadOtherFeeling() {
  if (!otherUser) return;
  console.log('[APP] Loading other feeling for:', otherUser);

  if (supabaseAvailable && supabaseClient) {
    try {
      var result = await supabaseClient
        .from('feelings')
        .select('feeling, created_at')
        .eq('user_name', otherUser)
        .order('created_at', { ascending: false })
        .limit(1);

      if (result.error) {
        console.error('[APP] Supabase load other error:', result.error);
        loadOtherFeelingLocal();
        return;
      }

      if (result.data && result.data.length > 0) {
        if (otherFeelingText) otherFeelingText.textContent = result.data[0].feeling;
        if (statusTime) statusTime.textContent = formatTime(result.data[0].created_at);
      } else {
        if (otherFeelingText) otherFeelingText.textContent = 'لم يشارك شعوراً بعد';
        if (statusTime) statusTime.textContent = '';
      }
      return;
    } catch (err) {
      console.error('[APP] Load other feeling exception:', err);
    }
  }

  loadOtherFeelingLocal();
}

function loadOtherFeelingLocal() {
  var data = lsGet('feelings_data') || {};
  if (data[otherUser]) {
    if (otherFeelingText) otherFeelingText.textContent = data[otherUser].feeling;
    if (statusTime) statusTime.textContent = formatTime(data[otherUser].created_at);
  } else {
    if (otherFeelingText) otherFeelingText.textContent = 'لم يشارك شعوراً بعد';
    if (statusTime) statusTime.textContent = '';
  }
}

// ============================================
// واجهة المستخدم
// ============================================

function selectFeelingInUI(feeling) {
  var radios = document.querySelectorAll('input[name="feeling"]');
  var found = false;

  for (var i = 0; i < radios.length; i++) {
    if (radios[i].value === feeling) {
      radios[i].checked = true;
      found = true;
    } else {
      radios[i].checked = false;
    }
  }

  if (!found) {
    if (customInput) customInput.value = feeling;
  } else {
    if (customInput) customInput.value = '';
  }
}

function addCustomFeeling() {
  var feeling = customInput ? customInput.value.trim() : '';
  if (!feeling) {
    if (customInput) customInput.focus();
    return;
  }

  var radios = document.querySelectorAll('input[name="feeling"]');
  for (var i = 0; i < radios.length; i++) {
    radios[i].checked = false;
  }
  saveFeeling(feeling);
}

function showToast(message, isError) {
  isError = isError || false;
  if (!toastEl) return;
  var span = toastEl.querySelector('span');
  if (span) span.textContent = message;

  if (isError) {
    toastEl.style.background = '#c75a82';
  } else {
    toastEl.style.background = 'var(--text-main)';
  }

  toastEl.classList.add('show');

  setTimeout(function() {
    toastEl.classList.remove('show');
  }, 2500);
}

function formatTime(dateString) {
  var date = new Date(dateString);
  var now = new Date();
  var diff = Math.floor((now - date) / 1000);

  if (diff < 60) return 'منذ لحظات';
  if (diff < 3600) return 'منذ ' + Math.floor(diff / 60) + ' دقيقة';
  if (diff < 86400) return 'منذ ' + Math.floor(diff / 3600) + ' ساعة';
  return 'منذ ' + Math.floor(diff / 86400) + ' يوم';
}

// ============================================
// Realtime - تحديثات فورية
// ============================================

function subscribeToRealtime() {
  if (!supabaseAvailable || !supabaseClient) return;

  if (realtimeChannel) {
    try { realtimeChannel.unsubscribe(); } catch(e) {}
  }

  realtimeChannel = supabaseClient
    .channel('feelings-channel')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'feelings',
        filter: 'user_name=eq.' + otherUser
      },
      function(payload) {
        console.log('[APP] Realtime update:', payload);
        loadOtherFeeling();
      }
    )
    .subscribe(function(status) {
      console.log('[APP] Realtime status:', status);
    });
}

// ============================================
// إعداد الأحداث
// ============================================

function initEventListeners() {
  console.log('[APP] Initializing event listeners...');

  initLoginScreen();

  var logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  var radios = document.querySelectorAll('input[name="feeling"]');
  for (var i = 0; i < radios.length; i++) {
    radios[i].addEventListener('change', function(e) {
      if (e.target.checked) {
        if (customInput) customInput.value = '';
        saveFeeling(e.target.value);
      }
    });
  }

  if (addCustomBtn) addCustomBtn.addEventListener('click', addCustomFeeling);

  if (customInput) {
    customInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        addCustomFeeling();
      }
    });
  }

  console.log('[APP] Event listeners initialized');
}

// ============================================
// تهيئة التطبيق
// ============================================

function checkExistingSession() {
  var savedUser = localStorage.getItem('currentUser');
  if (savedUser && (savedUser === 'حمودي' || savedUser === 'فوفو')) {
    console.log('[APP] Restoring session for:', savedUser);
    login(savedUser);
  }
}

// بدء التطبيق
document.addEventListener('DOMContentLoaded', function() {
  console.log('[APP] DOM loaded, starting app...');
  initEventListeners();
  checkExistingSession();
});
