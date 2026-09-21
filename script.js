const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');
const portrait = document.querySelector('.portrait');

emailjs.init({ publicKey: 'uqSzhDf6aXpDCp5QP' });

if (portrait) {
  const portraitFrame = document.createElement('div');
  portraitFrame.className = 'portrait-frame';
  portrait.before(portraitFrame);
  portraitFrame.appendChild(portrait);
}

menuToggle.addEventListener('click', () => {
  const isOpen = navLinks.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', isOpen);
});

document.querySelectorAll('.nav-links a').forEach((link) => {
  link.addEventListener('click', () => navLinks.classList.remove('open'));
});

const contactForm = document.querySelector('#contact-form');

contactForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = contactForm.querySelector('button[type="submit"]');
  const status = contactForm.querySelector('.form-status');
  const replyTo = contactForm.querySelector('[name="reply_to"]');
  const email = contactForm.querySelector('[name="email"]');
  const name = contactForm.querySelector('[name="name"]');
  const message = contactForm.querySelector('[name="message"]');

  replyTo.value = email.value;

  submitButton.disabled = true;
  submitButton.textContent = 'Enviando...';
  status.textContent = '';

  try {
    await emailjs.send('service_8mokl9i', 'template_2upz7sn', {
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

