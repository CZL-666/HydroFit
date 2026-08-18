const loginForm = document.querySelector("#loginForm");
const emailInput = document.querySelector("#emailInput");
const passwordInput = document.querySelector("#passwordInput");
const loginNote = document.querySelector("#loginNote");

function setLoginNote(message, isError = false) {
  loginNote.textContent = message;
  loginNote.classList.toggle("error", isError);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    setLoginNote("正在登录...");
    const { error } = await supabaseClient.auth.signInWithPassword({
      email: emailInput.value.trim(),
      password: passwordInput.value,
    });
    if (error) throw error;
    location.href = "./index.html";
  } catch (error) {
    setLoginNote(error.message || "登录失败，请检查邮箱和密码。", true);
  }
});

async function initLogin() {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  if (session) location.href = "./index.html";
}

initLogin();
