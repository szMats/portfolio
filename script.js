const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');
const portrait = document.querySelector('.portrait');
const contactForm = document.querySelector('#contact-form');

if (window.emailjs?.init) window.emailjs.init({ publicKey: 'uqSzhDf6aXpDCp5QP' });

if (portrait) {
  const portraitFrame = document.createElement('div');
  portraitFrame.className = 'portrait-frame';
  portrait.before(portraitFrame);
  portraitFrame.appendChild(portrait);
}

menuToggle.addEventListener('click', () => {
  const isOpen = navLinks.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', isOpen);
  menuToggle.setAttribute('aria-label', isOpen ? 'Fechar menu' : 'Abrir menu');
});

document.querySelectorAll('.nav-links a').forEach((link) => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Abrir menu');
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && navLinks.classList.contains('open')) {
    navLinks.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Abrir menu');
    menuToggle.focus();
  }
});

const navigationSections = [...document.querySelectorAll('main section[id]')];
if ('IntersectionObserver' in window) {
  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      document.querySelectorAll('.nav-links a').forEach((link) => {
        const isCurrent = link.hash === `#${entry.target.id}`;
        link.classList.toggle('active', isCurrent);
        if (isCurrent) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    });
  }, { rootMargin: '-30% 0px -60% 0px' });
  navigationSections.forEach((section) => sectionObserver.observe(section));
}

window.addEventListener('resize', () => {
  if (window.innerWidth > 760 && navLinks.classList.contains('open')) {
    navLinks.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Abrir menu');
  }
});

if (contactForm) contactForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = contactForm.querySelector('button[type="submit"]');
  const status = contactForm.querySelector('.form-status');
  const email = contactForm.querySelector('[name="email"]');
  const name = contactForm.querySelector('[name="name"]');
  const message = contactForm.querySelector('[name="message"]');

  if (!window.emailjs?.send) {
    status.textContent = 'O serviço de envio está indisponível. Tente novamente mais tarde.';
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Enviando...';
  status.textContent = '';

  try {
    await window.emailjs.send('service_8mokl9i', 'template_2upz7sn', {
      name: name.value,
      email: email.value,
      from_email: email.value,
      reply_to: email.value,
      message: message.value
    });
    contactForm.reset();
    status.textContent = 'Mensagem enviada com sucesso.';
  } catch (error) {
    status.textContent = 'Não foi possível enviar agora. Tente novamente.';
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Enviar mensagem ao Matheus';
  }
});

