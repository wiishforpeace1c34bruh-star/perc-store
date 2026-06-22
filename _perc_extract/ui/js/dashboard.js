export async function initDashboard(supabase, session) {
  // --- Tab Switching Logic ---
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => {
        b.classList.remove('active');
        b.style.background = 'transparent';
        if (b.id !== 'tab-btn-admin') {
          b.style.color = 'var(--text-muted)';
        }
        b.style.borderColor = 'transparent';
      });
      tabContents.forEach(c => c.style.display = 'none');

      btn.classList.add('active');
      btn.style.background = '';
      btn.style.color = '';
      btn.style.borderColor = '';
      
      const tabId = btn.getAttribute('data-tab');
      document.getElementById(`tab-${tabId}`).style.display = tabId === 'chat' ? 'flex' : 'block';
    });
  });

  // --- Elements ---
  const usernameInput = document.getElementById('profile-username-input');
  const bioInput = document.getElementById('profile-bio-input');
  const bannerPreview = document.getElementById('profile-banner-preview');
  const avatarPreview = document.getElementById('profile-avatar-preview');
  const adminTabBtn = document.getElementById('tab-btn-admin');
  
  let currentProfile = null;
  let activeChannel = 'general';
  let replyToMessage = null;

  async function loadProfile() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      
      if (!error && data) {
        currentProfile = data;
        usernameInput.value = currentProfile.username || 'Anonymous';
        if(bioInput) bioInput.value = currentProfile.bio || '';
        updatePreviews(currentProfile);

        if (currentProfile.is_admin) {
          adminTabBtn.style.display = 'inline-block';
          loadAdminPanel();
        }

        // Setup License Tab
        setupLicenseUI();
      }
    } catch (err) {
      console.error('Profile initialization failed:', err);
    }
  }

  function updatePreviews(profile) {
    if (!bannerPreview) return;
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

  function setupLicenseUI() {
    const licenseContainer = document.getElementById('license-status-container');
    const purchaseBtn = document.getElementById('btn-purchase-access');
    if(!licenseContainer || !purchaseBtn) return;
    
    if (currentProfile.has_access) {
      licenseContainer.innerHTML = `
        <div style="background: rgba(46, 213, 115, 0.1); border: 1px solid rgba(46, 213, 115, 0.3); border-radius: var(--radius-md); padding: 1.5rem; display: inline-block;">
          <h3 style="color: #2ed573; margin: 0 0 0.5rem 0;">Active License</h3>
          <p style="color: var(--text-muted); font-size: 0.9rem; margin: 0;">Full access granted.</p>
        </div>
      `;
      purchaseBtn.style.display = 'none';
    } else {
      purchaseBtn.style.display = 'block';
    }
  }

  // --- Profile Saving ---
  const profileForm = document.getElementById('profile-edit-form');
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const updates = { bio: bioInput.value, updated_at: new Date() };
      await supabase.from('profiles').update(updates).eq('id', session.user.id);
      alert('Profile updated.');
    });
  }

  // --- Admin Panel ---
  async function loadAdminPanel() {
    const tableBody = document.getElementById('admin-users-table');
    if (!tableBody) return;

    const { data: users, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) { console.error('Admin Error:', error); return; }

    tableBody.innerHTML = '';
    users.forEach(u => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
      
      const timeoutDate = u.timeout_until ? new Date(u.timeout_until).toLocaleString() : 'None';
      
      tr.innerHTML = `
        <td style="padding: 0.5rem;">${u.username || 'Unknown'}</td>
        <td style="padding: 0.5rem; color: ${u.has_access ? '#2ed573' : 'var(--text-muted)'}">${u.has_access ? 'Yes' : 'No'}</td>
        <td style="padding: 0.5rem; color: ${u.is_banned ? '#ff3366' : 'var(--text-muted)'}">${u.is_banned ? 'Banned' : 'No'}</td>
        <td style="padding: 0.5rem;">${timeoutDate}</td>
        <td style="padding: 0.5rem;">
          <button class="admin-action-btn" onclick="window.adminToggleAccess('${u.id}', ${!u.has_access})">Toggle Access</button>
          <button class="admin-action-btn danger" onclick="window.adminToggleBan('${u.id}', ${!u.is_banned})">${u.is_banned ? 'Unban' : 'Ban'}</button>
          <button class="admin-action-btn danger" onclick="window.adminTimeout('${u.id}')">24h Timeout</button>
        </td>
      `;
      tableBody.appendChild(tr);
    });
  }

  window.adminToggleAccess = async (id, val) => {
    await supabase.from('profiles').update({ has_access: val }).eq('id', id);
    loadAdminPanel();
  };
  window.adminToggleBan = async (id, val) => {
    await supabase.from('profiles').update({ is_banned: val }).eq('id', id);
    loadAdminPanel();
  };
  window.adminTimeout = async (id) => {
    const d = new Date();
    d.setHours(d.getHours() + 24);
    await supabase.from('profiles').update({ timeout_until: d.toISOString() }).eq('id', id);
    loadAdminPanel();
  };

  // --- Friends System ---
  const friendForm = document.getElementById('friend-request-form');
  const friendInput = document.getElementById('friend-username-input');
  const pendingList = document.getElementById('friends-pending-list');
  const activeList = document.getElementById('friends-active-list');

  if (friendForm) {
    friendForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const targetUser = friendInput.value.trim();
      const statusMsg = document.getElementById('friend-status-msg');
      
      const { data: user, error: uErr } = await supabase.from('profiles').select('id').eq('username', targetUser).single();
      if (uErr || !user) {
        statusMsg.textContent = 'User not found.';
        return;
      }
      if (user.id === session.user.id) {
        statusMsg.textContent = 'You cannot add yourself.';
        return;
      }

      const { error } = await supabase.from('friends').insert({
        requester_id: session.user.id,
        addressee_id: user.id,
        status: 'pending'
      });

      if (error) {
        statusMsg.textContent = 'Request already exists or error occurred.';
      } else {
        statusMsg.textContent = 'Request sent!';
        friendInput.value = '';
        loadFriends();
      }
    });
  }

  async function loadFriends() {
    if (!pendingList || !activeList) return;
    pendingList.innerHTML = ''; activeList.innerHTML = '';

    const { data, error } = await supabase.from('friends')
      .select('id, status, requester_id, addressee_id, req:requester_id(id,username,avatar_url), add:addressee_id(id,username,avatar_url)')
      .or(`requester_id.eq.${session.user.id},addressee_id.eq.${session.user.id}`);
      
    if (error) return;

    data.forEach(f => {
      const isReq = f.requester_id === session.user.id;
      const otherUser = isReq ? f.add : f.req;
      const av = otherUser.avatar_url || `https://ui-avatars.com/api/?name=${otherUser.username}&background=111&color=ec4899`;

      const div = document.createElement('div');
      div.className = 'friend-item';
      
      let actionHtml = '';
      if (f.status === 'pending') {
        if (!isReq) {
          actionHtml = `<button class="btn btn-primary btn-sm" onclick="window.acceptFriend('${f.id}')">Accept</button>`;
        } else {
          actionHtml = `<span style="color:var(--text-muted);font-size:0.8rem;">Pending...</span>`;
        }
      }

      div.innerHTML = `
        <div style="display:flex; align-items:center; gap:0.75rem;">
          <img src="${av}" style="width:32px; height:32px; border-radius:50%;">
          <span style="font-family:var(--font-mono); font-size:0.9rem;">${otherUser.username}</span>
        </div>
        <div>${actionHtml}</div>
      `;

      if (f.status === 'pending') pendingList.appendChild(div);
      else activeList.appendChild(div);
    });
  }

  window.acceptFriend = async (id) => {
    await supabase.from('friends').update({ status: 'accepted' }).eq('id', id);
    loadFriends();
  };

  // --- Live Chat System ---
  const chatMessages = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-message-input');
  const chatForm = document.getElementById('chat-input-form');
  const channelBtns = document.querySelectorAll('.channel-btn');
  const channelTitle = document.getElementById('chat-channel-title');
  const replyPreview = document.getElementById('chat-reply-preview');

  channelBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      channelBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeChannel = btn.getAttribute('data-channel');
      channelTitle.textContent = `# ${activeChannel}`;
      chatInput.placeholder = `Message #${activeChannel}...`;
      cancelReply();
      loadMessages();
    });
  });

  function escapeHtml(str) {
    return (str||'').replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  function cancelReply() {
    replyToMessage = null;
    if(replyPreview) replyPreview.style.display = 'none';
  }

  if (document.getElementById('btn-cancel-reply')) {
    document.getElementById('btn-cancel-reply').addEventListener('click', cancelReply);
  }

  window.setReply = (msgId, author, text) => {
    replyToMessage = msgId;
    document.getElementById('reply-preview-author').textContent = author;
    document.getElementById('reply-preview-text').textContent = text.substring(0, 50) + '...';
    replyPreview.style.display = 'flex';
    chatInput.focus();
  };

  window.addReaction = async (msgId, emoji) => {
    await supabase.from('reactions').insert({ message_id: msgId, profile_id: session.user.id, emoji: emoji });
  };

  window.openUserModal = async (userId) => {
    const { data: u } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if(!u) return;
    document.getElementById('user-modal-username').textContent = u.username;
    document.getElementById('user-modal-bio').textContent = u.bio || 'No bio provided.';
    document.getElementById('user-modal-avatar').src = u.avatar_url || `https://ui-avatars.com/api/?name=${u.username}&background=111&color=ec4899`;
    document.getElementById('user-modal-banner').style.backgroundImage = u.banner_url ? `url('${u.banner_url}')` : 'none';
    
    document.getElementById('user-modal').style.display = 'block';
    document.getElementById('user-modal-overlay').style.display = 'block';

    const addBtn = document.getElementById('btn-modal-add-friend');
    addBtn.onclick = async () => {
      await supabase.from('friends').insert({ requester_id: session.user.id, addressee_id: u.id, status: 'pending' });
      addBtn.textContent = 'Request Sent!';
      addBtn.disabled = true;
    };
  };

  if(document.getElementById('btn-close-user-modal')){
    document.getElementById('btn-close-user-modal').addEventListener('click', () => {
      document.getElementById('user-modal').style.display = 'none';
      document.getElementById('user-modal-overlay').style.display = 'none';
    });
  }

  function renderMessage(msg) {
    const div = document.createElement('div');
    div.className = 'chat-message-row';
    
    const time = new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    const is_admin = msg.profiles?.is_admin;
    const username = msg.profiles?.username || 'Anonymous';
    const avatarUrl = msg.profiles?.avatar_url || `https://ui-avatars.com/api/?name=${username}&background=111&color=ec4899`;
    
    let authorHtml = `<strong style="cursor:pointer;" onclick="window.openUserModal('${msg.profile_id}')">${username}</strong>`;
    if (is_admin) authorHtml += ` <span style="color:var(--accent); font-size:0.75rem;">[ADMIN]</span>`;

    let replyHtml = '';
    if (msg.reply_to_id && msg.reply_to_msg) {
      replyHtml = `<div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">
        ↳ Replying to ${msg.reply_to_msg.profiles?.username || 'Unknown'}
      </div>`;
    }

    let reactionsHtml = '<div style="margin-top:0.25rem; display:flex; gap:0.25rem;">';
    if(msg.reactions) {
      const counts = {};
      msg.reactions.forEach(r => counts[r.emoji] = (counts[r.emoji]||0) + 1);
      for(const [e, c] of Object.entries(counts)) {
        reactionsHtml += `<span class="reaction-badge">${e} ${c}</span>`;
      }
    }
    reactionsHtml += '</div>';

    const escapedContent = escapeHtml(msg.content);

    div.innerHTML = `
      <img src="${avatarUrl}" class="chat-avatar-clickable" onclick="window.openUserModal('${msg.profile_id}')" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; margin-top: 4px;" />
      <div style="flex: 1; display: flex; flex-direction: column; min-width: 0;">
        ${replyHtml}
        <div style="display: flex; align-items: baseline; gap: 0.5rem; margin-bottom: 0.25rem;">
          ${authorHtml}
          <span style="font-size: 0.7rem; color: var(--text-muted);">${time}</span>
        </div>
        <div style="color: var(--text-secondary); word-wrap: break-word; font-size: 0.95rem; line-height: 1.5;">
          ${escapedContent}
        </div>
        ${reactionsHtml}
      </div>
      <div class="chat-actions">
        <button class="chat-action-btn" title="Reply" onclick="window.setReply('${msg.id}', '${username}', \`${escapedContent.replace(/"/g, "&quot;")}\`)">↩</button>
        <button class="chat-action-btn" title="React 👍" onclick="window.addReaction('${msg.id}', '👍')">👍</button>
        <button class="chat-action-btn" title="React 💀" onclick="window.addReaction('${msg.id}', '💀')">💀</button>
        <button class="chat-action-btn" title="React ❤️" onclick="window.addReaction('${msg.id}', '❤️')">❤️</button>
      </div>
    `;
    
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  async function loadMessages() {
    chatMessages.innerHTML = '';
    const { data, error } = await supabase
      .from('messages')
      .select('*, profiles(username, is_admin, avatar_url), reply_to_msg:reply_to_id(profiles(username)), reactions(emoji, profile_id)')
      .eq('channel_id', activeChannel)
      .order('created_at', { ascending: true })
      .limit(50);
      
    if (error) { console.error('Error loading msgs:', error); return; }

    if (data.length === 0) {
      chatMessages.innerHTML = `<div style="color: var(--text-muted); text-align: center; font-family: var(--font-mono); font-size: 0.8rem; margin-top: 2rem;">Welcome to #${activeChannel}.</div>`;
    } else {
      data.forEach(renderMessage);
    }
  }

  if (chatForm) {
    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const content = chatInput.value.trim();
      if (!content) return;
      chatInput.value = '';
      const replyId = replyToMessage;
      cancelReply();

      // Ensure we don't insert if banned or timeout
      if (currentProfile.is_banned) {
        alert("You are banned and cannot send messages.");
        return;
      }
      if (currentProfile.timeout_until && new Date(currentProfile.timeout_until) > new Date()) {
        alert(`You are timed out until ${new Date(currentProfile.timeout_until).toLocaleString()}.`);
        return;
      }

      await supabase.from('messages').insert({
        profile_id: session.user.id,
        channel_id: activeChannel,
        reply_to_id: replyId,
        content: content
      });
    });
  }

  // Realtime subscriptions
  supabase.channel('public:messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
      if (payload.new.channel_id !== activeChannel) return;
      
      const { data: msg } = await supabase.from('messages')
        .select('*, profiles(username, is_admin, avatar_url), reply_to_msg:reply_to_id(profiles(username)), reactions(emoji, profile_id)')
        .eq('id', payload.new.id).single();
      
      if(chatMessages.innerHTML.includes('Welcome to')) chatMessages.innerHTML = '';
      if(msg) renderMessage(msg);
    }).subscribe();

  supabase.channel('public:reactions')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reactions' }, () => {
      loadMessages(); // Reload all messages to show new reactions simply
    }).subscribe();

  // Initialization
  await loadProfile();
  loadFriends();
  loadMessages();
}
