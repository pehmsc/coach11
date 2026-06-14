// Handler externalizado da offline.html (Bloco C: script-src sem unsafe-inline).
// Substitui o antigo onclick inline, que um nonce nao consegue autorizar.
document.getElementById("retry")?.addEventListener("click", function () {
  window.location.reload();
});
