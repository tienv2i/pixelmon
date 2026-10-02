#!/usr/bin/env bash

# ==============================================================================
# Script tự động hẹn giờ tắt máy (Mặc định 2 tiếng = 120 phút)
# Sử dụng:
#   ./auto_shutdown.sh          -> Hẹn tắt máy sau 2 tiếng
#   ./auto_shutdown.sh 90       -> Hẹn tắt máy sau 90 phút (tuỳ chỉnh số phút)
#   ./auto_shutdown.sh cancel   -> Huỷ hẹn giờ tắt máy
#   ./auto_shutdown.sh status   -> Xem trạng thái hẹn giờ
# ==============================================================================

ACTION="${1:-120}"

if [ "$ACTION" = "cancel" ] || [ "$ACTION" = "-c" ] || [ "$ACTION" = "--cancel" ]; then
    echo "=========================================="
    echo "🛑 Đang huỷ lệnh hẹn giờ tắt máy..."
    echo "=========================================="
    if command -v shutdown >/dev/null 2>&1; then
        sudo shutdown -c 2>/dev/null || shutdown -c 2>/dev/null
        if [ $? -eq 0 ]; then
            echo "✅ Đã huỷ thành công lịch tắt máy!"
        else
            echo "⚠️  Không thể huỷ hoặc hiện tại không có lịch hẹn tắt máy nào."
        fi
    fi
    exit 0
fi

if [ "$ACTION" = "status" ] || [ "$ACTION" = "--status" ] || [ "$ACTION" = "-s" ]; then
    echo "=========================================="
    echo "ℹ️  Kiểm tra trạng thái hẹn giờ tắt máy..."
    echo "=========================================="
    if command -v shutdown >/dev/null 2>&1; then
        shutdown --show 2>/dev/null || sudo shutdown --show 2>/dev/null || echo "Không có lịch hẹn tắt máy nào đang chạy."
    fi
    exit 0
fi

# Mặc định là số phút (nếu không truyền số thì lấy 120 phút = 2 tiếng)
MINUTES=120
if [[ "$ACTION" =~ ^[0-9]+$ ]]; then
    MINUTES="$ACTION"
fi

HOURS=$(awk "BEGIN {printf \"%.1f\", $MINUTES/60}")
TARGET_TIME=$(date -d "+$MINUTES minutes" "+%H:%M:%S ngày %d/%m/%Y")

echo "=========================================================="
echo "⏳ BẮT ĐẦU HẸN GIỜ TỰ ĐỘNG TẮT MÁY"
echo "=========================================================="
echo "⏱️  Thời gian chờ : $MINUTES phút (~$HOURS tiếng)"
echo "🕒 Dự kiến tắt máy: $TARGET_TIME"
echo "💡 Để huỷ hẹn giờ: chạy lệnh './auto_shutdown.sh cancel'"
echo "=========================================================="

# Thử chạy shutdown (thường cần sudo nếu không phải console active session)
MSG="Máy tính sẽ tự động tắt sau $MINUTES phút ($TARGET_TIME)."
if sudo shutdown +"$MINUTES" "$MSG" 2>/dev/null || shutdown +"$MINUTES" "$MSG" 2>/dev/null; then
    echo ""
    echo "✅ ĐÃ LÊN LỊCH TẮT MÁY THÀNH CÔNG!"
    echo "Hệ thống sẽ tự động tắt lúc: $TARGET_TIME"
    echo "Nếu muốn huỷ bất kỳ lúc nào, gõ: ./auto_shutdown.sh cancel"
else
    echo ""
    echo "⚠️  Cần quyền sudo để thực thi lệnh tắt máy."
    echo "Vui lòng chạy lại bằng lệnh: sudo ./auto_shutdown.sh"
fi
