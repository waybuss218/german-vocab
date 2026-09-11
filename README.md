# 德福考前必备词汇复习网站（根目录最终版）

请将本目录中的 `index.html`、`app.js`、`style.css` 以及 12 个 JSON 文件放在 GitHub 仓库根目录。

不要建立 `data/` 文件夹，也不要把 JSON 放进 `data/`。网站统一从根目录读取：`words.json`、`sections.json`、`stages.json`、`verb_forms.json`、`preposition_collocations.json`、`word_relations.json`、`module5_root_groups.json`、`module5_members.json`、`prefix_groups.json`、`prefix_group_members.json`、`root_groups.json`、`module5_cross_part_groups.json`。

保留你现有的 `supabase-config.js`，不要用本包覆盖它。

本版同时加入移动端触控/窄屏适配，并给 CSS、Supabase 配置和 app.js 加版本参数以避免 GitHub Pages 继续使用旧缓存。
