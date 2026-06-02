export async function initDashboard(supabase, session) {
  const profileForm = document.getElementById('profile-edit-form');
  const bioInput = document.getElementById('profile-bio-input');
  const usernameInput = document.getElementById('profile-username-input');
  const bannerPreview = document.getElementById('profile-banner-preview');
  const avatarPreview = document.getElementById('profile-avatar-preview');
  const saveStatus = document.getElementById('profile-save-status');

  const uploadBanner = document.getElementById('upload-banner');
  const uploadAvatar = document.getElementById('upload-avatar');

  const chatForm = document.getElementById('chat-input-form');
  const chatInput = document.getElementById('chat-message-input');
  const chatMessages = document.getElementById('chat-messages');

  let currentProfile = null;

  async function loadProfile() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        console.error('Error loading profile:', error);
        return;
      }

      if (!data) {
        // Missing profile! Backfill it so chat works.
        const defaultUsername = session.user.user_metadata?.username || session.user.email.split('@')[0];
        const isAdmin = session.user.email === 'wiishforpeace1c34bruh@gmail.com';
        
        const { data: newProfile, error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: session.user.id,
            username: defaultUsername,
            is_admin: isAdmin
          })
          .select()
          .single();
          
        if (insertError) throw insertError;
        currentProfile = newProfile;
      } else {
        currentProfile = data;
      }

      usernameInput.value = currentProfile.username || session.user.email;
      bioInput.value = currentProfile.bio || '';
      updatePreviews(currentProfile);
      
    } catch (err) {
      console.error('Profile initialization failed:', err);
    }
  }

  function updatePreviews(profile) {
    if (profile.banner_url) {
      bannerPreview.style.backgroundImage = `url('${profile.banner_url}')`;
    } else {
      bannerPreview.style.backgroundImage = 'none';
    }

    if (profile.avatar_url) {
      avatarPreview.src = profile.avatar_url;
    } else {
      avatarPreview.src = `https://ui-avatars.com/api/?name=${profile.username || 'User'}&background=111&color=ec4899`;
    }
  }

  // --- Profile Updating (Bio) ---
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      saveStatus.textContent = 'Saving...';
      
      const updates = {
        id: session.user.id,
        bio: bioInput.value,
        updated_at: new Date()
      };

      try {
        const { error } = await supabase.from('profiles').upsert(updates);
        if (error) throw error;
        
        saveStatus.textContent = 'Profile updated securely.';
        setTimeout(() => saveStatus.textContent = '', 3000);
      } catch (err) {
        saveStatus.textContent = 'Error: ' + err.message;
        saveStatus.style.color = '#ff3366';
      }
    });
  }

  // --- Image Uploading ---
  async function handleImageUpload(file, type) {
    if (!file) return;
    saveStatus.textContent = `Uploading ${type}...`;
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${session.user.id}-${type}-${Math.random()}.${fileExt}`;
    const filePath = `${session.user.id}/${fileName}`;

    try {
      // 1. Upload to Storage
      const { error: uploadError } = await supabase.storage
        .from('profiles')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 2. Get Public URL
      const { data } = supabase.storage
        .from('profiles')
        .getPublicUrl(filePath);

      const publicUrl = data.publicUrl;

      // 3. Update Profile Database
      const updates = { id: session.user.id };
      if (type === 'banner') updates.banner_url = publicUrl;
      if (type === 'avatar') updates.avatar_url = publicUrl;

      const { error: updateError } = await supabase.from('profiles').upsert(updates);
      if (updateError) throw updateError;

      // 4. Update UI
      currentProfile = { ...currentProfile, ...updates };
      updatePreviews(currentProfile);
      saveStatus.textContent = `${type} updated successfully.`;
      setTimeout(() => saveStatus.textContent = '', 3000);

    } catch (err) {
      saveStatus.textContent = 'Upload failed: ' + err.message;
      saveStatus.style.color = '#ff3366';
    }
  }

  if (uploadBanner) {
    uploadBanner.addEventListener('change', (e) => {
      handleImageUpload(e.target.files[0], 'banner');
    });
  }

  if (uploadAvatar) {
    uploadAvatar.addEventListener('change', (e) => {
      handleImageUpload(e.target.files[0], 'avatar');
    });
  }


  // --- Live Chatroom ---
  const checkmarkSvg = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" style="margin-top: 1px;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

  function renderMessage(msg) {
    const div = document.createElement('div');
    div.className = 'chat-message';
    
    const time = new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    const is_admin = msg.profiles && msg.profiles.is_admin;
    const username = msg.profiles ? (msg.profiles.username || 'Unknown Agent') : 'Unknown Agent';
    
    let authorHtml = `<span class="chat-message-author">${username}</span>`;
    if (is_admin) {
      authorHtml = `<span class="chat-message-author admin-username">${username}</span><span class="admin-badge" title="Verified Administrator">${checkmarkSvg}</span>`;
    }

    div.innerHTML = `
      <div class="chat-message-header">
        <div>${authorHtml}</div>
        <div class="chat-message-time">${time}</div>
      </div>
      <div class="chat-message-content">${escapeHtml(msg.content)}</div>
    `;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
  }

  async function loadMessages() {
    chatMessages.innerHTML = '';
    const { data, error } = await supabase
      .from('messages')
      .select('*, profiles(username, is_admin)')
      .order('created_at', { ascending: true })
      .limit(50);
      
    if (error) {
      console.error('Error loading messages:', error);
      return;
    }

    if (data.length === 0) {
      chatMessages.innerHTML = '<div style="color: var(--text-muted); text-align: center; font-family: var(--font-mono); font-size: 0.8rem; margin-top: 2rem;">Secure channel opened. No recent communications.</div>';
    } else {
      data.forEach(renderMessage);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  if (chatForm) {
    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const content = chatInput.value.trim();
      if (!content) return;
      
      chatInput.value = '';
      
      try {
        const { error } = await supabase.from('messages').insert({
          profile_id: session.user.id,
          content: content
        });
        if (error) throw error;
      } catch (err) {
        console.error('Failed to send message:', err);
        alert('Failed to send message. Make sure your profile is initialized.');
      }
    });
  }

  // Subscribe to real-time messages
  const messageSubscription = supabase
    .channel('public:messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
      // Fetch profile for the new message to get username and is_admin
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, is_admin')
        .eq('id', payload.new.profile_id)
        .single();
        
      const newMsg = { ...payload.new, profiles: profile };
      
      // Remove placeholder if it's the first message
      if (chatMessages.innerHTML.includes('Secure channel opened')) {
        chatMessages.innerHTML = '';
      }
      
      renderMessage(newMsg);
    })
    .subscribe();

  // Initialization
  await loadProfile();
  await loadMessages();
}
