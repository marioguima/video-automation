# Manual Video Smoke Test

Teste rapido para gerar um video com 5 imagens + 5 audios locais.

## Estrutura

- `assets/images/`: imagens de teste
- `assets/audios/`: audios de teste (`audio_1.wav` ... `audio_5.wav`)
- `assets/test_script_ai.md`: roteiro curto de IA
- `render_test_video.py`: script que concatena audio e renderiza o video
- `output/`: saidas geradas

## Como rodar

```powershell
backend\.venv\Scripts\python.exe -m backend.tests.manual_video.render_test_video
```

Rodar com preset especifico:

```powershell
backend\.venv\Scripts\python.exe -m backend.tests.manual_video.render_test_video --fps 30 --preset B
```

Testar transicao in/out separada do motion:

```powershell
backend\.venv\Scripts\python.exe -m backend.tests.manual_video.render_test_video --fps 30 --preset D --transition T2 --suffix d_t2
```

Comparar so transicoes (T1/T2/T3) mantendo o mesmo motion:

```powershell
backend\.venv\Scripts\python.exe -m backend.tests.manual_video.render_test_video --fps 30 --preset D --transition all_t --suffix d_allt
```

Testar transicao entre imagens com flash white/black:

```powershell
backend\.venv\Scripts\python.exe -m backend.tests.manual_video.render_test_video --fps 30 --preset D --transition T6 --xfade flash_white --suffix d_t6_fw
backend\.venv\Scripts\python.exe -m backend.tests.manual_video.render_test_video --fps 30 --preset D --transition T6 --xfade flash_black --suffix d_t6_fb
```

Comparar fades basicos:

```powershell
backend\.venv\Scripts\python.exe -m backend.tests.manual_video.render_test_video --fps 30 --preset D --transition T6 --xfade all_basic --suffix d_t6_xfades
```

Comparar flashes centrados no corte (5 frames):

```powershell
backend\.venv\Scripts\python.exe -m backend.tests.manual_video.render_test_video --fps 30 --preset D --transition T6 --xfade all_flash_centered --suffix d_t6_centered
```

Comparar flash centrado simples vs premium (sem ghosting):

```powershell
backend\.venv\Scripts\python.exe -m backend.tests.manual_video.render_test_video --fps 30 --preset D --transition T6 --xfade all_flash_premium --suffix d_t6_flashpremium
```

Comparar versao premium white vs black (mesma logica, muda so a cor):

```powershell
backend\.venv\Scripts\python.exe -m backend.tests.manual_video.render_test_video --fps 30 --preset D --transition T6 --xfade all_flash_premium_wb --suffix d_t6_flashpremium_wb
```

Rodar lote com presets por letra (A-F):

```powershell
backend\.venv\Scripts\python.exe -m backend.tests.manual_video.render_test_video --fps 30 --preset all_letters --suffix batch
```

Presets atuais:

- `A` = `A_zoom_soft_hold` (zoom only)
- `B` = `B_zoom_balanced_hold` (zoom only, padrao)
- `C` = `C_zoom_micro_pullout` (zoom only)
- `D` = `D_zoom_cinematic` (zoom only)
- `E` = `E_pan_premium_lr` (pan only)
- `F` = `F_pan_premium_rl` (pan only)
- `G` = `G_zoom_pulse_accel` (zoom only, pulso sutil + aceleracao)
- `H` = `H_transition_envelope` (zoom only, inicio bem sutil + aceleracao do meio para frente)

Transicoes (zoom in/out) separadas:

- `T1` = `T1_subtle`
- `T2` = `T2_standard`
- `T3` = `T3_aggressive`
- `T4` = `T4_continuous` (curva continua, sem quebra de velocidade)
- `T5` = `T5_blur_burst` (entrada grande com blur que cai rapido + desaceleracao)
- `T6` = `T6_inertial_ref` (15f blur, 46f in/out, sem parada rigida no meio)

Transicoes entre imagens (`xfade`):

- `fade`
- `flash_white` (`fadewhite`)
- `flash_black` (`fadeblack`)
- `XF1_flash_white_centered_5f` (fadewhite, duracao fixa de 5 frames)
- `XF2_flash_black_centered_5f` (fadeblack, duracao fixa de 5 frames)
- `XF3_flash_white_occluded_5f` (custom, 5 frames, sem ghosting A+B)
- `XF3b_flash_white_occluded_6f` (custom, 6 frames, sem ghosting A+B, 2 frames brancos no centro)
- `XF3b_flash_black_occluded_6f` (custom, 6 frames, sem ghosting A+B, 2 frames pretos no centro)
- `XF3c_flash_white_occluded_5f_1o3w1o` (custom, 5 frames, sem ghosting A+B, 1 opacidade / 3 brancos / 1 opacidade)

Saidas:

- `backend/tests/manual_video/output/audio_concat.wav`
- `backend/tests/manual_video/output/video_test_5imgs_1920x1080.mp4`
