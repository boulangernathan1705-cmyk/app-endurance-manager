// The Fiche mémo is now the first tab of the « Plugin SimHub » page (simhub.html): old links and bookmarks land there,
// with the combo they named (?track=…&car=…).
location.replace(`/simhub.html${location.search}${location.hash}`);
