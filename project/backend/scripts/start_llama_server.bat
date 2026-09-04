@echo off
echo Starting llama-server with Qwen2.5-VL-7B on CUDA GPU...
"C:\Users\shinc\Downloads\llama-b10709-bin-win-cuda-13.3-x64\llama-server.exe" ^
  -m "C:\Users\shinc\Qwen2.5-VL-7B\Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf" ^
  --mmproj "C:\Users\shinc\Qwen2.5-VL-7B\mmproj-Qwen2.5-VL-7B-Instruct-Q8_0.gguf" ^
  -ngl 99 ^
  -c 4096 ^
  --port 8081
pause
