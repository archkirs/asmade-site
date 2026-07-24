(()=>{
  const pageUrl=new URL(window.location.href);
  const source=pageUrl.searchParams.get('source');
  const message=pageUrl.searchParams.get('message');
  const safe=/^[A-Za-z0-9_-]{1,64}$/;

  if(!source||!message||!safe.test(source)||!safe.test(message)) return;

  document.querySelectorAll('a[href^="https://tally.so/r/NpQkRB"]').forEach(link=>{
    const target=new URL(link.href);
    target.searchParams.set('source',source);
    target.searchParams.set('message',message);
    link.href=target.toString();
  });
})();
