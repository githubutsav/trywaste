// auth.js
// Handles login & registration using Supabase Auth

// Auth methods: password, phone OTP, Google/GitHub OAuth, guest
(async function() {
  const supabase = window.supabaseClient;
  const loginForm = document.getElementById('login-form');
  const phonePanel = document.getElementById('phone-otp-panel');
  const registerForm = document.getElementById('register-form');
  const formTitle = document.getElementById('form-title');
  const toggleLine = document.getElementById('toggle-line');
  const toRegisterBtn = document.getElementById('to-register');
  const phoneBackBtn = document.getElementById('phone-back-email');
  let mode = 'login'; // login | register | phone
  const msg = document.getElementById('auth-message');

  function setMessage(text, type='info') {
    msg.textContent = text;
    msg.className = 'text-center text-sm ' + (type === 'error' ? 'text-red-400' : type === 'success' ? 'text-emerald-400' : 'text-slate-400');
  }

  // Mode switching
  function setMode(next) {
    mode = next;
    const inPhone = mode === 'phone';
    const inRegister = mode === 'register';
    if (inPhone) {
      loginForm.classList.add('hidden');
      registerForm?.classList.add('hidden');
      phonePanel.classList.remove('hidden');
      formTitle.textContent = 'Phone Login';
      toggleLine.innerHTML = 'Use email instead? <button id="to-email" class="text-emerald-400 hover:underline">Login</button>';
      toggleLine.querySelector('#to-email').addEventListener('click', () => setMode('login'));
    } else if (inRegister) {
      loginForm.classList.add('hidden');
      phonePanel.classList.add('hidden');
      registerForm.classList.remove('hidden');
      formTitle.textContent = 'Register';
      toggleLine.innerHTML = 'Already have an account? <button id="to-login" class="text-emerald-400 hover:underline">Login</button>';
      toggleLine.querySelector('#to-login').addEventListener('click', () => setMode('login'));
    } else { // login
      phonePanel.classList.add('hidden');
      registerForm?.classList.add('hidden');
      loginForm.classList.remove('hidden');
      formTitle.textContent = 'Login';
      toggleLine.innerHTML = 'Don\'t have an account? <button id="to-register" class="text-emerald-400 hover:underline">Register</button> · <button id="to-phone" class="text-slate-400 hover:text-emerald-400">Phone OTP</button>';
      toggleLine.querySelector('#to-register').addEventListener('click', () => setMode('register'));
      toggleLine.querySelector('#to-phone').addEventListener('click', () => setMode('phone'));
    }
    setMessage('');
  }

  const phoneMethodBtn = document.getElementById('phone-method');
  phoneMethodBtn?.addEventListener('click', () => setMode('phone'));
  phoneBackBtn?.addEventListener('click', () => setMode('login'));
  // Phone OTP
  const phoneSendBtn = document.getElementById('phone-send-code');
  const phoneVerifyBtn = document.getElementById('phone-verify-code');
  const phoneResendBtn = document.getElementById('phone-resend');
  const phoneStepSend = document.getElementById('phone-step-send');
  const phoneStepVerify = document.getElementById('phone-step-verify');
  let lastPhone = '';

  phoneSendBtn?.addEventListener('click', async () => {
    const phone = document.getElementById('phone-number').value.trim();
    if (!phone) return setMessage('Enter phone number', 'error');
    setMessage('Sending code...');
    const sp = document.getElementById('phone-send-spinner');
    sp.classList.remove('hidden');
    const { error } = await supabase.auth.signInWithOtp({ phone });
    sp.classList.add('hidden');
    if (error) return setMessage(error.message, 'error');
    lastPhone = phone;
    phoneStepSend.classList.add('hidden');
    phoneStepVerify.classList.remove('hidden');
    setMessage('Code sent via SMS.', 'success');
  });

  phoneResendBtn?.addEventListener('click', async () => {
    if (!lastPhone) return;
    setMessage('Resending code...');
    const { error } = await supabase.auth.signInWithOtp({ phone: lastPhone });
    if (error) return setMessage(error.message, 'error');
    setMessage('Code resent.', 'success');
  });

  phoneVerifyBtn?.addEventListener('click', async () => {
    const code = document.getElementById('phone-otp-code').value.trim();
    if (!lastPhone || !code) return setMessage('Need phone & code', 'error');
    setMessage('Verifying code...');
    const sp = document.getElementById('phone-verify-spinner');
    sp.classList.remove('hidden');
    const { data, error } = await supabase.auth.verifyOtp({ phone: lastPhone, token: code, type: 'sms' });
    sp.classList.add('hidden');
    if (error) return setMessage(error.message, 'error');
    if (data.session) {
      setMessage('Phone verified. Redirecting...', 'success');
      setTimeout(()=> window.location.href='admin.html', 700);
    }
  });

  // Google OAuth
  document.getElementById('google-oauth')?.addEventListener('click', async () => {
  setMessage('Redirecting to Google...');
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/login.html' } });
  if (error) setMessage(error.message, 'error');
  });

  // GitHub button removed

  // Guest login (anonymous session via service role not possible client-only). We'll simulate local guest.
  document.getElementById('guest-login')?.addEventListener('click', () => {
    localStorage.setItem('guestSession', '1');
    setMessage('Continuing as guest (limited access).', 'success');
    setTimeout(()=> window.location.href = 'index.html', 500);
  });

  // Forgot password (send reset link)
  document.getElementById('forgot-pass')?.addEventListener('click', async () => {
    const email = (document.getElementById('login-email')?.value || '').trim();
    if (!email) return setMessage('Enter email first', 'error');
    setMessage('Sending reset link...');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/login.html' });
    if (error) return setMessage(error.message, 'error');
    setMessage('Reset link sent (check email).', 'success');
  });

  toRegisterBtn?.addEventListener('click', () => setMode('register'));

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMessage('Logging in...');
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const spinner = document.getElementById('login-spinner');
    spinner.classList.remove('hidden');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    spinner.classList.add('hidden');
    if (error) return setMessage(error.message, 'error');
    // After login, check user role and redirect
    const { session } = data;
    if (session && session.user) {
      setMessage('Checking role...', 'info');
      const { data: roleRow, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .single();
      if (roleError || !roleRow) {
        setMessage('Login successful. Redirecting to app...', 'success');
        setTimeout(()=> window.location.href = 'index.html', 800);
      } else if (roleRow.role === 'admin') {
        setMessage('Welcome admin! Redirecting...', 'success');
        setTimeout(()=> window.location.href = 'admin.html', 800);
      } else {
        setMessage('Login successful. Redirecting to app...', 'success');
        setTimeout(()=> window.location.href = 'index.html', 800);
      }
    }
  });

  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMessage('Creating account...');
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const name = document.getElementById('reg-name').value.trim();
    const spinner = document.getElementById('register-spinner');
    spinner.classList.remove('hidden');
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
    spinner.classList.add('hidden');
    if (error) return setMessage(error.message, 'error');
    if (data.user) {
      setMessage('Signup successful. Check email (if confirmations enabled).', 'success');
  setMode('login');
    }
  });

  // If already logged in, skip
  // If already logged in, check role and redirect
  const { data: { session } } = await supabase.auth.getSession();
  if (session && session.user) {
    setMessage('Checking role...', 'info');
    const { data: roleRow, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', session.user.id)
      .single();
    if (error || !roleRow) {
      setMessage('Already logged in. Redirecting...', 'success');
      setTimeout(()=> window.location.href = 'index.html', 500);
    } else if (roleRow.role === 'admin') {
      setMessage('Welcome admin! Redirecting...', 'success');
      setTimeout(()=> window.location.href = 'admin.html', 500);
    } else {
      setMessage('Already logged in. Redirecting...', 'success');
      setTimeout(()=> window.location.href = 'index.html', 500);
    }
  }

  // Default state
  setMode('login');
})();
