(() => {
  window.va = window.va || function () {
    (window.vaq = window.vaq || []).push(arguments);
  };

  window.si = window.si || function () {
    (window.siq = window.siq || []).push(arguments);
  };

  const scripts = [
    '/_vercel/insights/script.js',
    '/_vercel/speed-insights/script.js',
  ];

  scripts.forEach((src) => {
    if (document.querySelector(`script[src="${src}"]`)) return;

    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    document.head.appendChild(script);
  });
})();

(() => {
  const variants = {
    '/index-v2.html': 'home',
    '/student-v2.html': 'student',
    '/artist-v2.html': 'artist',
    '/reviewer-v2.html': 'reviewer',
  };

  const variant = variants[window.location.pathname];
  if (!variant) return;

  const applyVariant = () => {
    const hero = document.querySelector('.landing-main .hero-copy');
    const title = document.getElementById('hero-title');
    if (!hero || !title) return;

    const ledes = [...hero.querySelectorAll('.hero-lede')];

    const style = document.createElement('style');
    style.textContent = `
      .landing-main .hero-lede .hero-hit {
        color: var(--accent);
        font-weight: 650;
      }
      .landing-main .hero-stage h1 .hero-title-line {
        display: block;
      }
      @media (max-width: 760px) {
        .landing-main .hero-lede .hero-hit {
          font-weight: 680;
        }
      }
    `;
    document.head.appendChild(style);

    if (variant === 'home') {
      title.innerHTML = 'Was AI used?<span class="made-word hero-title-line">That\'s only the first question.</span>';
      ledes[0].innerHTML = 'What did the person <span class="hero-hit">actually do</span>? <span class="hero-hit">How was AI used?</span> Which <span class="hero-hit">decisions shaped the work?</span>';
      ledes[1].innerHTML = 'A finished work <span class="hero-hit">doesn\'t always make those answers visible.</span>';
      ledes[2].innerHTML = '<strong>AsMade creates a <span class="hero-hit">MADE Record</span></strong> for one specific work. It brings that context together — including what information is available about the process and <span class="hero-hit">what remains unknown.</span>';
    }

    if (variant === 'student') {
      ledes[0].innerHTML = 'A finished assignment shows the result. But the result alone doesn\'t always show <span class="hero-hit">what you did</span>, <span class="hero-hit">where AI was used</span>, or <span class="hero-hit">which decisions you made.</span>';
      ledes[1].innerHTML = '<strong>A <span class="hero-hit">MADE Record</span></strong> brings that context together for one specific assignment: what you did, how AI was used, the decisions that shaped the work, and the information available about the process.';
    }

    if (variant === 'artist') {
      title.innerHTML = 'They see the AI.<span class="made-word hero-title-line">Do they see your creative role?</span>';
      ledes[0].innerHTML = 'The finished work doesn\'t always show <span class="hero-hit">what you contributed</span>, what you selected or changed, <span class="hero-hit">which decisions you made</span>, or <span class="hero-hit">how AI fit into the process.</span>';
      ledes[1].innerHTML = '<strong>A <span class="hero-hit">MADE Record</span></strong> brings that context together for one specific work: what you did, how AI was used, the decisions that shaped the work, available materials, and what remains unknown.';
      if (ledes[2]) ledes[2].remove();
    }

    if (variant === 'reviewer') {
      title.innerHTML = 'When AI is part of the work,<span class="made-word hero-title-line">what are you actually judging?</span>';
      ledes[0].innerHTML = 'The finished work shows the result. It doesn\'t always show <span class="hero-hit">what the person did</span>, <span class="hero-hit">how AI was used</span>, or <span class="hero-hit">which decisions shaped the work.</span>';
      ledes[1].innerHTML = '<strong>A <span class="hero-hit">MADE Record</span></strong> brings that context together for one specific work. It shows what the person did, how AI was used, the actions and decisions that shaped the work, what information is available about the process, and <span class="hero-hit">what remains unknown.</span>';
    }

    const variantLinks = {
      '/': '/index-v2.html',
      'student.html': '/student-v2.html',
      '/student.html': '/student-v2.html',
      'artist.html': '/artist-v2.html',
      '/artist.html': '/artist-v2.html',
      'reviewer.html': '/reviewer-v2.html',
      '/reviewer.html': '/reviewer-v2.html',
    };

    document.querySelectorAll('a[href]').forEach((link) => {
      const href = link.getAttribute('href');
      if (Object.prototype.hasOwnProperty.call(variantLinks, href)) {
        link.setAttribute('href', variantLinks[href]);
      }
    });

    document.documentElement.dataset.heroVariant = '2';
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyVariant, { once: true });
  } else {
    applyVariant();
  }
})();
