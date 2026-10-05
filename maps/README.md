# 地圖版本庫（maps/）

使用者說「保存」時，才把那張地圖的當下版本存一份到這裡。其他時候的修改都在 git 歷史裡。

```
maps/<地圖>/<版本>_<日期>/
  07r_ryokan.js      地圖佈局與玩法（src/ 的那一份）
  ryokan_glb.js      Blender 模型（assets/maps/ryokan.js）
  blender/*.py       Blender 建模腳本
  tools/             plan 匯出、GLB 打包、當時的 plan.json
  NOTES.md           這一版的內容與已知問題
```

還原某一版：
1. 把 `07r_ryokan.js` 複製回 `src/`。
2. 把 `ryokan_glb.js` 複製回 `assets/maps/ryokan.js`。
3. 執行 `sh src/build.sh`。
