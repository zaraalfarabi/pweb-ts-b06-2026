/*
 * login.ts
 * Membutuhkan dist/session.js dimuat sebelum file ini.
 *
 * Alur:
 * 1. POST /auth/login (username + password) -> accessToken
 * 2. GET  /auth/me (Bearer token) -> data user lengkap termasuk role
 *    (respons /auth/login DummyJSON tidak menyertakan role)
 * 3. Simpan token, role, firstName ke Local Storage
 * 4. Redirect: admin/moderator -> index.html, user -> operator.html
 *
 * Seluruh kode dibungkus IIFE agar tidak ada variabel global yang bisa
 * bentrok dengan file TypeScript anggota lain (semua file berbagi scope global).
 */

(() => {
  interface LoginApiResponse {
    id: number;
    username: string;
    firstName: string;
    accessToken?: string;
    token?: string; // nama field lama di versi DummyJSON sebelumnya
    message?: string;
  }

  interface LoginUserProfile {
    id: number;
    username: string;
    firstName: string;
    role?: string;
  }

  interface LoginUserFilterResponse {
    users: { username: string; password: string; firstName: string; role: string }[];
  }

  const LOGIN_REQUEST_TIMEOUT_MS = 15000;

  /* Error khusus agar pesan bisa dibedakan antara kredensial & jaringan. */
  class LoginError extends Error {
    constructor(message: string, public readonly kind: "credential" | "network" | "server") {
      super(message);
      this.name = "LoginError";
    }
  }

  /* ---------- Elemen DOM ---------- */
  const loginForm = document.querySelector<HTMLFormElement>("#login-form");
  const usernameInput = document.querySelector<HTMLInputElement>("#username");
  const passwordInput = document.querySelector<HTMLInputElement>("#password");
  const rememberInput = document.querySelector<HTMLInputElement>("#remember-me");
  const loginButton = document.querySelector<HTMLButtonElement>("#login-button");
  const buttonLabel = document.querySelector<HTMLElement>("#login-button .button-label");
  const loginMessage = document.querySelector<HTMLParagraphElement>("#login-message");
  const togglePasswordButton = document.querySelector<HTMLButtonElement>("#toggle-password");
  const forgotPasswordButton = document.querySelector<HTMLButtonElement>("#forgot-password");
  const testAccountList = document.querySelector<HTMLDivElement>("#test-accounts");

  const LOGIN_REMEMBER_KEY = "queueRememberUsername";

  /* ---------- Helper tampilan ---------- */
  function showMessage(text: string, type: "error" | "info" = "error"): void {
    if (!loginMessage) return;
    loginMessage.textContent = text;
    loginMessage.classList.toggle("is-info", type === "info");
  }

  function markInvalid(isInvalid: boolean): void {
    [usernameInput, passwordInput].forEach((input) => {
      input?.closest(".input-wrap")?.classList.toggle("is-invalid", isInvalid);
      input?.setAttribute("aria-invalid", String(isInvalid));
    });
  }

  function setLoading(isLoading: boolean): void {
    if (!loginButton || !buttonLabel) return;
    loginButton.disabled = isLoading;
    loginButton.classList.toggle("is-loading", isLoading);
    loginButton.setAttribute("aria-busy", String(isLoading));
    buttonLabel.textContent = isLoading ? "Memverifikasi..." : "Masuk";
    if (usernameInput) usernameInput.disabled = isLoading;
    if (passwordInput) passwordInput.disabled = isLoading;
  }

  /* ---------- Helper request ---------- */
  async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), LOGIN_REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function readErrorMessage(response: Response, fallback: string): Promise<string> {
    try {
      const data = (await response.json()) as { message?: string };
      return data.message || fallback;
    } catch {
      return fallback;
    }
  }

  async function requestLogin(username: string, password: string): Promise<LoginApiResponse> {
    const response = await fetchWithTimeout(`${DUMMYJSON_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, expiresInMins: 60 })
    });

    if (response.status === 400 || response.status === 401) {
      await readErrorMessage(response, "");
      throw new LoginError("Username atau password salah. Silakan periksa kembali.", "credential");
    }
    if (!response.ok) {
      const msg = await readErrorMessage(response, `Server mengembalikan status ${response.status}.`);
      throw new LoginError(`Login gagal: ${msg}`, "server");
    }

    return (await response.json()) as LoginApiResponse;
  }

  /* Role diambil dari respons server: /auth/me (terautentikasi token),
   * cadangan ke /users/{id} bila /auth/me gagal. */
  async function requestUserRole(token: string, userId: number): Promise<UserRole> {
    let profile: LoginUserProfile | null = null;

    const meResponse = await fetchWithTimeout(`${DUMMYJSON_BASE_URL}/auth/me`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` }
    });

    if (meResponse.ok) {
      profile = (await meResponse.json()) as LoginUserProfile;
    } else {
      const userResponse = await fetchWithTimeout(`${DUMMYJSON_BASE_URL}/users/${userId}`);
      if (userResponse.ok) profile = (await userResponse.json()) as LoginUserProfile;
    }

    const role = normalizeRole(profile?.role);
    if (!role) {
      throw new LoginError("Role pengguna tidak dikenali dari respons server.", "server");
    }
    return role;
  }

  /* ---------- Data uji (endpoint filter role) ---------- */
  async function loadTestAccounts(): Promise<void> {
    if (!testAccountList) return;

    try {
      const roles = ["admin", "user"] as const;
      const results = await Promise.all(
        roles.map(async (role) => {
          const url =
            `${DUMMYJSON_BASE_URL}/users/filter?key=role&value=${role}` +
            `&limit=2&select=username,password,firstName,role`;
          const response = await fetchWithTimeout(url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = (await response.json()) as LoginUserFilterResponse;
          return data.users.slice(0, 2);
        })
      );

      const accounts = results.flat();
      if (accounts.length === 0) return;

      testAccountList.replaceChildren(
        ...accounts.map((account) => {
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = "account-chip";
          chip.title = `Isi form dengan akun ${account.username}`;

          const roleBadge = document.createElement("span");
          roleBadge.className = `role-badge role-${account.role}`;
          roleBadge.textContent = account.role;

          const name = document.createElement("span");
          name.textContent = account.username;

          chip.append(roleBadge, name);
          chip.addEventListener("click", () => {
            if (!usernameInput || !passwordInput) return;
            usernameInput.value = account.username;
            passwordInput.value = account.password;
            markInvalid(false);
            showMessage("");
            loginButton?.focus();
          });
          return chip;
        })
      );
      testAccountList.hidden = false;
    } catch {
      // Data uji hanya pelengkap; jika gagal dimuat, form login tetap berfungsi.
      testAccountList.hidden = true;
    }
  }

  /* ---------- Inisialisasi ---------- */
  function initLoginPage(): void {
    if (
      !loginForm || !usernameInput || !passwordInput || !rememberInput ||
      !loginButton || !buttonLabel || !loginMessage || !togglePasswordButton
    ) {
      throw new Error("Elemen halaman login tidak lengkap. Periksa login.html.");
    }

    // Auto redirect jika sesi masih tersimpan.
    const existingSession = getSession();
    if (existingSession) {
      window.location.replace(getHomePageForRole(existingSession.role));
      return;
    }

    const form = loginForm;
    const userField = usernameInput;
    const passField = passwordInput;
    const rememberField = rememberInput;
    const toggleButton = togglePasswordButton;

    const rememberedUsername = localStorage.getItem(LOGIN_REMEMBER_KEY);
    if (rememberedUsername) {
      userField.value = rememberedUsername;
      rememberField.checked = true;
    }

    toggleButton.addEventListener("click", () => {
      const isVisible = passField.type === "text";
      passField.type = isVisible ? "password" : "text";
      toggleButton.setAttribute("aria-pressed", String(!isVisible));
      toggleButton.setAttribute("aria-label", isVisible ? "Tampilkan password" : "Sembunyikan password");
    });

    forgotPasswordButton?.addEventListener("click", () => {
      showMessage(
        "Akun praktikum berasal dari DummyJSON. Pilih salah satu akun uji di bawah atau lihat dummyjson.com/users.",
        "info"
      );
    });

    [userField, passField].forEach((input) =>
      input.addEventListener("input", () => {
        markInvalid(false);
        if (loginMessage.textContent) showMessage("");
      })
    );

    form.addEventListener("submit", async (event: SubmitEvent) => {
      event.preventDefault();
      showMessage("");
      markInvalid(false);

      const username = userField.value.trim();
      const password = passField.value;

      if (!username || !password) {
        showMessage("Username dan password wajib diisi.");
        (!username ? userField : passField).closest(".input-wrap")?.classList.add("is-invalid");
        (!username ? userField : passField).focus();
        return;
      }

      setLoading(true);

      try {
        const loginData = await requestLogin(username, password);
        const token = loginData.accessToken ?? loginData.token;
        if (!token || !loginData.firstName) {
          throw new LoginError("Respons login dari server tidak lengkap.", "server");
        }

        const role = await requestUserRole(token, loginData.id);

        saveSession({ token, role, firstName: loginData.firstName });

        if (rememberField.checked) {
          localStorage.setItem(LOGIN_REMEMBER_KEY, loginData.username);
        } else {
          localStorage.removeItem(LOGIN_REMEMBER_KEY);
        }

        window.location.href = getHomePageForRole(role);
      } catch (error: unknown) {
        if (error instanceof LoginError) {
          showMessage(error.message);
          if (error.kind === "credential") {
            markInvalid(true);
            passField.value = "";
            passField.focus();
          }
        } else if (error instanceof DOMException && error.name === "AbortError") {
          showMessage("Server tidak merespons. Periksa koneksi internet lalu coba lagi.");
        } else if (error instanceof TypeError || !navigator.onLine) {
          // fetch() melempar TypeError ketika jaringan gagal / offline.
          showMessage("Gagal terhubung ke server. Periksa koneksi internet Anda.");
        } else {
          showMessage("Terjadi kesalahan tak terduga. Silakan coba lagi.");
        }
        setLoading(false);
      }
    });

    void loadTestAccounts();
  }

  initLoginPage();
})();
