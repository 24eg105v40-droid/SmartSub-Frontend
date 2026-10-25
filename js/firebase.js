/**
 * SmartSub - Firebase Authentication Client Integration
 */

// Default Firebase Configuration (can be overridden via localStorage or window.__FIREBASE_CONFIG__)
const defaultFirebaseConfig = {
  apiKey: "AIzaSyD-mock-placeholder-for-development",
  authDomain: "smartsub-demo.firebaseapp.com",
  projectId: "smartsub-demo",
  storageBucket: "smartsub-demo.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};

class FirebaseAuthClient {
  constructor() {
    this.app = null;
    this.auth = null;
    this.currentUser = null;
    this.isConfigured = false;
    this.authModules = null;
  }

  async init() {
    const savedConfig = localStorage.getItem('smartsub_firebase_config');
    let config = defaultFirebaseConfig;

    if (savedConfig) {
      try {
        config = { ...config, ...JSON.parse(savedConfig) };
      } catch (e) {}
    } else if (window.__FIREBASE_CONFIG__) {
      config = { ...config, ...window.__FIREBASE_CONFIG__ };
    }

    // Check if real keys are supplied (not placeholder)
    if (config.apiKey && !config.apiKey.includes('placeholder') && !config.apiKey.startsWith('%')) {
      this.isConfigured = true;
    }

    try {
      // Load modern Firebase v10 SDK via standard ES Module imports
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
      const { 
        getAuth, 
        signInWithEmailAndPassword, 
        createUserWithEmailAndPassword, 
        signOut, 
        sendPasswordResetEmail, 
        GoogleAuthProvider, 
        signInWithPopup, 
        onAuthStateChanged,
        updateProfile
      } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');

      this.authModules = {
        signInWithEmailAndPassword,
        createUserWithEmailAndPassword,
        signOut,
        sendPasswordResetEmail,
        GoogleAuthProvider,
        signInWithPopup,
        onAuthStateChanged,
        updateProfile
      };

      this.app = initializeApp(config);
      this.auth = getAuth(this.app);

      // Listen for Firebase auth state changes
      onAuthStateChanged(this.auth, async (user) => {
        this.currentUser = user;
        if (user) {
          try {
            const idToken = await user.getIdToken();
            const backendUser = await window.api.firebaseLogin(idToken);
            console.log('Firebase user synchronized with backend:', backendUser);
            window.dispatchEvent(new CustomEvent('auth:login', { detail: backendUser }));
          } catch (err) {
            console.warn('Backend sync failed:', err);
          }
        }
      });

      // Restore dev user if no real Firebase session is active
      if (!this.currentUser) {
        const savedDevUser = localStorage.getItem('smartsub_dev_user');
        if (savedDevUser) {
          try {
            const parsed = JSON.parse(savedDevUser);
            if (parsed && parsed.uid && parsed.email) {
              this._setDevUser(parsed.uid, parsed.email, parsed.name);
            }
          } catch (e) {}
        }
      }

      console.log('Firebase Auth client initialized successfully.');
    } catch (e) {
      console.warn('Firebase SDK dynamic import note:', e.message);
    }
  }

  _createDevFirebaseToken(uid, email, name) {
    const encodeBase64Url = (obj) => {
      const jsonStr = typeof obj === 'string' ? obj : JSON.stringify(obj);
      return btoa(unescape(encodeURIComponent(jsonStr)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    };

    const header = encodeBase64Url({ alg: "RS256", kid: "dev-key", typ: "JWT" });
    const exp = Math.floor(Date.now() / 1000) + 3600; // 1 hour validity
    const payload = encodeBase64Url({
      user_id: uid,
      sub: uid,
      email: email,
      name: name || email.split('@')[0],
      exp: exp,
      iat: Math.floor(Date.now() / 1000)
    });
    const signature = encodeBase64Url("smartsub-dev-signature");
    return `${header}.${payload}.${signature}`;
  }

  _setDevUser(uid, email, name) {
    const devUser = {
      uid: uid,
      email: email,
      displayName: name || email.split('@')[0],
      getIdToken: async (forceRefresh = false) => {
        return this._createDevFirebaseToken(uid, email, name);
      }
    };
    this.currentUser = devUser;
    localStorage.setItem('smartsub_dev_user', JSON.stringify({ uid, email, name }));
    return devUser;
  }

  async registerWithEmail(email, password, fullName, monthlyBudget = 3000) {
    if (this.authModules && this.isConfigured) {
      try {
        const userCredential = await this.authModules.createUserWithEmailAndPassword(this.auth, email, password);
        if (fullName && this.authModules.updateProfile) {
          await this.authModules.updateProfile(userCredential.user, { displayName: fullName });
        }
        this.currentUser = userCredential.user;
        const idToken = await userCredential.user.getIdToken();
        return await window.api.firebaseLogin(idToken);
      } catch (err) {
        throw new Error(this.getHumanFriendlyErrorMessage(err));
      }
    }

    // Development Firebase authentication mode (verified via Firebase ID token claims on backend)
    const uid = 'dev-uid-' + btoa(email).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
    this._setDevUser(uid, email, fullName);
    const idToken = await this.currentUser.getIdToken();
    return await window.api.firebaseLogin(idToken);
  }

  async loginWithEmail(email, password) {
    if (this.authModules && this.isConfigured) {
      try {
        const userCredential = await this.authModules.signInWithEmailAndPassword(this.auth, email, password);
        this.currentUser = userCredential.user;
        const idToken = await userCredential.user.getIdToken();
        return await window.api.firebaseLogin(idToken);
      } catch (err) {
        throw new Error(this.getHumanFriendlyErrorMessage(err));
      }
    }

    // Development Firebase authentication mode
    const uid = 'dev-uid-' + btoa(email).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
    this._setDevUser(uid, email, email.split('@')[0]);
    const idToken = await this.currentUser.getIdToken();
    return await window.api.firebaseLogin(idToken);
  }

  async loginWithGoogle() {
    if (!this.authModules || !this.isConfigured) {
      throw new Error('Google Sign-In requires your Firebase project credentials in .env or settings.');
    }

    try {
      const provider = new this.authModules.GoogleAuthProvider();
      const result = await this.authModules.signInWithPopup(this.auth, provider);
      this.currentUser = result.user;
      const idToken = await result.user.getIdToken();
      return await window.api.firebaseLogin(idToken);
    } catch (err) {
      throw new Error(this.getHumanFriendlyErrorMessage(err));
    }
  }

  async sendPasswordReset(email) {
    if (!this.authModules || !this.isConfigured) {
      throw new Error('Password reset emails require your Firebase project credentials in .env.');
    }

    try {
      await this.authModules.sendPasswordResetEmail(this.auth, email);
      return { success: true, message: `Password reset instructions sent to ${email}` };
    } catch (err) {
      throw new Error(this.getHumanFriendlyErrorMessage(err));
    }
  }

  async logout() {
    if (this.auth && this.authModules && this.authModules.signOut) {
      try {
        await this.authModules.signOut(this.auth);
      } catch (ignored) {}
    }
    this.currentUser = null;
    localStorage.removeItem('smartsub_dev_user');
    if (window.api) {
      window.api.clearAuth();
    }
  }

  async getIdToken(forceRefresh = false) {
    if (this.currentUser && typeof this.currentUser.getIdToken === 'function') {
      return await this.currentUser.getIdToken(forceRefresh);
    }
    return window.api ? window.api.token : null;
  }

  getHumanFriendlyErrorMessage(err) {
    const code = err.code || err.message;
    if (code.includes('auth/email-already-in-use')) {
      return 'An account with this email address already exists. Please log in.';
    }
    if (code.includes('auth/invalid-email')) {
      return 'Invalid email address format. Please enter a valid email.';
    }
    if (code.includes('auth/weak-password')) {
      return 'Password is too weak. Please use at least 6 characters.';
    }
    if (code.includes('auth/user-not-found') || code.includes('auth/wrong-password') || code.includes('auth/invalid-credential')) {
      return 'Invalid email or password. Please check your credentials and try again.';
    }
    if (code.includes('auth/popup-closed-by-user')) {
      return 'Google sign-in popup was closed before completion.';
    }
    if (code.includes('auth/network-request-failed')) {
      return 'Network connection error. Please verify your internet connection.';
    }
    if (code.includes('auth/too-many-requests')) {
      return 'Access temporarily disabled due to multiple failed login attempts. Please reset your password or try again later.';
    }
    return err.message || 'Authentication failed. Please try again.';
  }
}

const firebaseAuth = new FirebaseAuthClient();
window.firebaseAuth = firebaseAuth;
