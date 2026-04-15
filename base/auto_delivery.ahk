#Requires AutoHotkey v2.0
#SingleInstance Force

; ============================================================
; 엑셀의 주문번호를 읽어와서 해당 사이트 주문 페이지를 오픈하여
; 택배사·송장번호를 가져오는 프로그램
; ============================================================
; 버전관리
; v0.1 - 2026-02-03: 초기 생성 (네이버)
; v0.2 - 2026-02-08: 지마켓 추가
; v0.3 - 2026-02-09: 오늘의집 추가
; v0.4 - 2026-02-18: 옥션 추가
; v0.5 - 2026-03-07: 11번가 추가
; ============================================================
; copyright ⓒ 2026 아넉스엣지. All rights reserved.
; 본 코드는 아넉스엣지에서 작성하였으며, 무단 복제 및 배포를 금지합니다.
; ============================================================

global AS_COL := 45
global START_ROW := 2
global NAVER_ORDER_BASE := "https://orders.pay.naver.com/order/status/"
global GMARKET_ORDER_BASE := "https://tracking.gmarket.co.kr/track/"
global OHOUS_ORDER_BASE := "https://ohou.se/orders/"
global AUCTION_ORDER_BASE := "https://tracking.auction.co.kr/?orderNo="
global ELEVENST_ORDER_BASE := "https://buy.11st.co.kr/my11st/order/OrderList.tmall"
; 11번가 전용: 목록(페이지번호 붙임), 배송추적(dlvNo 붙임), 검색할 최대 페이지 수
global ELEVENST_LIST_BASE := "https://buy.11st.co.kr/my11st/order/BuyManager.tmall?method=getCancelRequestListAjax&type=orderList2nd&pageNumber="
global ELEVENST_LIST_SUFFIX := "&rows=10"
global ELEVENST_TRACE_BASE := "https://buy.11st.co.kr/delivery/trace.tmall?dlvNo="
global ELEVENST_MAX_PAGE := 3   ; 11번가 기본 조회 페이지 수

global DELAY_BETWEEN_PAGES := 5000   ; 다음 주문으로 넘어가기 전 대기(ms)
global SLEEP_AFTER_LOAD := 5000   ; 주문상태 페이지 로드 후 대기(ms)
global SLEEP_AFTER_TRACK := 5000   ; 배송조회 클릭 후 페이지 로드 대기(ms)
global AO_COL := 41   ; 택배사
global AP_COL := 42   ; 송장번호
global myGui
global statusEdit
global elevenPageEdit

; GUI 생성
CreateGUI() {
    global myGui, statusEdit, elevenPageEdit

    myGui := Gui("+AlwaysOnTop +Resize", "송장번호 추출_v0.5")
    myGui.SetFont("s10", "맑은 고딕")

    btnExtract := myGui.AddButton("x30 y110 w120 h45", "네이버스토어`n송장번호 추출")
    btnGmarket := myGui.AddButton("x+10 yp w120 h45", "지마켓`n송장번호 추출")
    btnToday := myGui.AddButton("x+10 yp w120 h45", "오늘의집`n송장번호 추출")
    btnAuction := myGui.AddButton("x30 y160 w120 h45", "옥션`n송장번호 추출")
    btnElevenst := myGui.AddButton("x+10 yp w120 h45", "11번가`n송장번호 추출")
    btnExit := myGui.AddButton("x+10 yp w120 h45", "종료")
    statusEdit := myGui.AddEdit("x30 y20 w380 h80 ReadOnly", "")
    ; 11번가 조회 페이지 수 설정
    myGui.AddText("x30 y215 w140 h20", "11번가 조회 페이지 수")
    elevenPageEdit := myGui.AddEdit("x+5 yp w50 h20 Number", ELEVENST_MAX_PAGE)
    btnExtract.OnEvent("Click", ExtractButton_Click)
    btnExit.OnEvent("Click", ExitButton_Click)
    btnGmarket.OnEvent("Click", GmarketExtractButton_Click)
    btnToday.OnEvent("Click", TodayExtractButton_Click)
    btnAuction.OnEvent("Click", AuctionExtractButton_Click)
    btnElevenst.OnEvent("Click", ElevenstExtractButton_Click)

    myGui.OnEvent("Close", ExitButton_Click)
    myGui.Show("w440 h250")
}

; 상태 알림창에 메시지 추가 (MsgBox 대체)
SetStatus(msg) {
    global statusEdit
    if (statusEdit) {
        prev := statusEdit.Value
        statusEdit.Value := prev ? prev "`n" msg : msg
        ; 상태창에 새 메시지가 추가될 때마다 스크롤을 맨 아래로 이동
        SendMessage 0x115, 7,, statusEdit  ; WM_VSCROLL(0x115), SB_BOTTOM(7)
    }
}

TodayExtractButton_Click(*) {
    RunExtractionFlow(OHOUS_ORDER_BASE, "오늘의집", FetchCourierOhou)
}

ExtractButton_Click(*) {
    RunExtractionFlow(NAVER_ORDER_BASE, "네이버스토어", FetchCourierNaver)
}

GmarketExtractButton_Click(*) {
    RunExtractionFlow(GMARKET_ORDER_BASE, "지마켓", FetchCourierGmarket, "?trackingType=DELIVERY&charset=ko")
}

AuctionExtractButton_Click(*) {
    RunExtractionFlow(AUCTION_ORDER_BASE, "옥션", FetchCourierAuction)
}

ElevenstExtractButton_Click(*) {
    global ELEVENST_MAX_PAGE, elevenPageEdit
    val := Trim(elevenPageEdit.Value)
    if (val = "") {
        ELEVENST_MAX_PAGE := 3
    } else {
        pages := Integer(val)
        if (pages < 1)
            pages := 1
        ELEVENST_MAX_PAGE := pages
    }
    RunExtractionFlowElevenst()
}

; 공통: 주문번호 배열 기준으로 URL 열고, 플랫폼별 조회 후 엑셀에 기록
; siteName: 상태창 표시용 사이트명. urlSuffix: 선택. 지정 시 주문번호 뒤에 붙임 (예: 지마켓)
RunExtractionFlow(orderBaseUrl, siteName, fetchCourierFn, urlSuffix := "") {
    SetStatus(siteName " 송장번호등록 시작합니다.")
    arr := GetAsColumnValues()
    if (arr.Length = 0) {
        SetStatus("AS열에 주문번호가 없습니다.")
        return
    }
    EnsureChrome()
    for i, orderNum in arr {
        orderNum := Trim(orderNum)
        if (orderNum = "")
            continue
        url := orderBaseUrl . Integer(orderNum)
        if (urlSuffix != "")
            url .= urlSuffix
        OpenUrlInChrome(url)
        Sleep SLEEP_AFTER_LOAD
        company := "", trackingNo := ""
        fetchCourierFn(&company, &trackingNo)
        excelRow := START_ROW + i - 1
        WriteCourierToExcel(excelRow, company, trackingNo)
        if (i < arr.Length)
            Sleep DELAY_BETWEEN_PAGES
    }
    SetStatus(siteName " 송장번호등록 완료되었습니다.")
}

; 11번가 전용: 목록 페이지(1~ELEVENST_MAX_PAGE)에서 tmpck{주문번호} 검색 → value(dlvNo) 추출 → 배송추적 URL 이동 후 택배/송장 파싱
RunExtractionFlowElevenst() {
    global ELEVENST_MAX_PAGE
    SetStatus("11번가 송장번호등록 시작합니다. (최대 " ELEVENST_MAX_PAGE "페이지 조회)")
    arr := GetAsColumnValues()
    if (arr.Length = 0) {
        SetStatus("AS열에 주문번호가 없습니다.")
        return
    }
    EnsureChrome()
    for i, orderNum in arr {
        orderNum := Trim(orderNum)
        if (orderNum = "")
            continue
        dlvNo := ""
        ; 매 주문마다 1페이지부터 검색 (break 후 다음 for 반복에서 반드시 1로 시작)
        currentPage := 1
        loop ELEVENST_MAX_PAGE {
            listUrl := ELEVENST_LIST_BASE . currentPage . ELEVENST_LIST_SUFFIX
            OpenUrlInChrome(listUrl)
            Sleep SLEEP_AFTER_LOAD
            html := CopyPageSource()
            dlvNo := ParseDlvNoFromListPage(html, orderNum)
            if (dlvNo != "") {
                traceUrl := ELEVENST_TRACE_BASE . dlvNo
                OpenUrlInChrome(traceUrl)
                Sleep SLEEP_AFTER_LOAD
                company := ""
                trackingNo := ""
                FetchCourierElevenst(&company, &trackingNo)
                excelRow := START_ROW + i - 1
                WriteCourierToExcel(excelRow, company, trackingNo)
                break
            }
            currentPage += 1
        }
        ; 다음 주문은 1페이지부터 보도록 break 직후에도 초기화 (루프 변수 잔류 방지)
        currentPage := 1
        if (dlvNo = "") {
            excelRow := START_ROW + i - 1
            WriteCourierToExcel(excelRow, "", "")
            SetStatus("11번가: 주문번호 " orderNum " 를 " ELEVENST_MAX_PAGE "페이지까지 조회했지만 찾지 못했습니다.")
        }
        if (i < arr.Length)
            Sleep DELAY_BETWEEN_PAGES
    }
    SetStatus("11번가 송장번호등록 완료되었습니다.")
}

; 목록 페이지 HTML에서 해당 주문번호(ord-no)의 배송조회 행만 골라 dlvNo 추출 (같은 ord-no가 배송조회/상품미도착/리뷰작성에 반복되므로 ord-no 기준으로 직전 구간만 검사)
ParseDlvNoFromListPage(html, orderNum) {
    if (html = "")
        return ""
    ordNoNeedle := "ord-no=`"" . orderNum . "`""
    searchStart := 1
    Loop {
        pos := InStr(html, ordNoNeedle, 0, searchStart)
        if (!pos)
            return ""
        ; 이 ord-no 직전 350자(같은 <a> 안)에 goDeliveryTracking 이 있으면 배송조회 행
        start := Max(1, pos - 350)
        block := SubStr(html, start, 350)
        if RegExMatch(block, "goDeliveryTracking\('(\d+)'", &m) {
            ; 블록 내 마지막(ord-no에 가장 가까운) 매칭이 해당 행의 dlvNo
            lastDlv := ""
            p := 1
            while (RegExMatch(block, "goDeliveryTracking\('(\d+)'", &m2, p)) {
                lastDlv := m2[1]
                p := m2.Pos + 1
            }
            return lastDlv
        }
        searchStart := pos + 1
    }
}

; 네이버: 배송조회 클릭 → HTML 복사 → 택배사/송장 파싱
FetchCourierNaver(&company, &trackingNo) {
    ClickTrackDeliveryInChrome("naver")
    Sleep SLEEP_AFTER_TRACK
    html := CopyCurrentPageDomHtml()
    if (html != "")
        ParseCourierFromHtmlNaver(html, &company, &trackingNo)
}

; 지마켓: 배송조회 클릭 → div#layers 하위 iframe의 src로 이동 → 해당 페이지 HTML 복사 → 파싱
FetchCourierGmarket(&company, &trackingNo) {
    html := CopyCurrentPageDomHtml()
    if (html != "")
        ParseCourierFromHtmlGmarket(html, &company, &trackingNo)
}

; 옥션: 추적 페이지 열면 바로 표시 → 현재 페이지 DOM HTML 복사 → 파싱
FetchCourierAuction(&company, &trackingNo) {
    html := CopyCurrentPageDomHtml()
    if (html != "")
        ParseCourierFromHtmlAuction(html, &company, &trackingNo)
}

; 11번가: 현재 탭이 배송추적 페이지(trace.tmall?dlvNo=)일 때 호출. Ctrl+U 페이지 소스 복사 후 파싱
FetchCourierElevenst(&company, &trackingNo) {
    company := ""
    trackingNo := ""
    html := CopyPageSource()
    if (html != "")
        ParseCourierFromHtmlElevenst(html, &company, &trackingNo)
}

; 오늘의집: 배송조회(p.css-n2bvke.ez6thvb1) 클릭 → 페이지 소스 복사 → 택배사/송장 파싱
FetchCourierOhou(&company, &trackingNo) {
    ClickTrackDeliveryInChrome("ohou")
    Sleep SLEEP_AFTER_TRACK
    html := CopyPageSource()
    if (html != "")
        ParseCourierFromHtmlOhou(html, &company, &trackingNo)
}

ExitButton_Click(*) {
    ExitApp()
}

; 엑셀 AS열 2행부터 끝까지 읽어서 배열로 반환
GetAsColumnValues() {
    try {
        xl := ComObjActive("Excel.Application")
    } catch {
        SetStatus("엑셀을 먼저 열어주세요.")
        return []
    }

    wb := xl.ActiveWorkbook
    sh := wb.Worksheets(1)

    result := []
    row := START_ROW
    Loop {
        val := sh.Cells(row, AS_COL).Value
        if (val = "" || val = 0)
            break
        result.Push(val)
        row += 1
    }
    return result
}

; 크롬이 없으면 실행
EnsureChrome() {
    if !WinExist("ahk_exe chrome.exe") {
        Run "chrome.exe"
        WinWait "ahk_exe chrome.exe",, 5
    }
}

; 크롬 주소창에 URL 입력 후 접속
OpenUrlInChrome(url) {
    WinActivate "ahk_exe chrome.exe"
    WinWaitActive "ahk_exe chrome.exe",, 3
    A_Clipboard := url
    Send "^l"
    Sleep 80
    Send "^v"
    Sleep 80
    Send "{Enter}"
}

; 주소창에 javascript: 입력해서 현재 페이지의 '배송조회' 버튼 클릭
; {Text} 로 보내서 한글 키보드에서도 'javascript:' 가 ㅓㅁㅍㅁ... 로 안 찍히게 함
ClickTrackDeliveryInChrome(platform) {
    if (platform = "naver")
        js := "javascript:document.querySelector('[data-nlog-click-code=`"trackDelivery`"]').click();void(0);"
    else if (platform = "ohou")
        js := "javascript:document.querySelector('p.css-n2bvke.ez6thvb1').click();void(0);"
    else
        return
    WinActivate "ahk_exe chrome.exe"
    WinWaitActive "ahk_exe chrome.exe",, 3
    Send "^l"
    Sleep 150
    Send "{Text}" . js
    Sleep 150
    Send "{Enter}"
}

; 현재 페이지의 DOM 전체 HTML을 클립보드에 복사 후 반환 (React 등 SPA 렌더링 결과 포함)
; {Text} 로 보내서 한글 키보드에서도 문자 그대로 입력됨
CopyCurrentPageDomHtml() {
    WinActivate "ahk_exe chrome.exe"
    WinWaitActive "ahk_exe chrome.exe",, 3
    A_Clipboard := ""
    Send "^l"
    Sleep 150
    ; navigator.clipboard.writeText() 은 비동기+주소창 실행 시 권한 막힐 수 있음 → execCommand('copy') 로 동기 복사
    js := "javascript:(function(){var e=document.createElement('textarea');e.value=document.documentElement.outerHTML;document.body.appendChild(e);e.select();document.execCommand('copy');document.body.removeChild(e);})();void(0);"
    Send "{Text}" . js
    Sleep 150
    Send "{Enter}"
    if !ClipWait(5)
        return ""
    return A_Clipboard
}

; (참고) Ctrl+U 페이지 소스는 SPA에서 실제 내용이 없어서 미사용
CopyPageSource() {
    WinActivate "ahk_exe chrome.exe"
    WinWaitActive "ahk_exe chrome.exe",, 3
    A_Clipboard := ""
    Send "^u"
    Sleep 3500
    Send "^a"
    Sleep 600
    Send "^c"
    if !ClipWait(5)
        return ""
    html := A_Clipboard
    Send "^w"
    Sleep 500
    return html
}

; 네이버: HTML에서 택배사(Courier_company__WpuEg), 송장번호(Courier_number__5MVoy) 추출
ParseCourierFromHtmlNaver(html, &company, &trackingNo) {
    company := "", trackingNo := ""
    if RegExMatch(html, "Courier_company__WpuEg[^>]*>([^<]+)", &m)
        company := Trim(m[1])
    if RegExMatch(html, "Courier_number__5MVoy[^>]*>([^<]+)", &m)
        trackingNo := Trim(m[1])
}

; 지마켓: list-item--delivered 인 li 안의 마지막 span.text__delivery-address 에서 "택배사 송장번호" 추출
ParseCourierFromHtmlGmarket(html, &company, &trackingNo) {
    company := "", trackingNo := ""
    start := InStr(html, "list-item--delivered")
    if (!start)
        return
    haystack := SubStr(html, start)
    if RegExMatch(haystack, "s).*<span class=`"text__delivery-address`"[^>]*>([^<]+)</span>", &m) {
        line := Trim(m[1])
        if RegExMatch(line, "^(.+)\s+(\d+)$", &parts) {
            company := Trim(parts[1])
            trackingNo := Trim(parts[2])
        }
    }
}


; 옥션: list-item--delivered 내 text__delivery-cooper span 내용에서 "택배사명 + 공백 + 송장번호" 추출 (<!-- --> 제거 후 파싱)
ParseCourierFromHtmlAuction(html, &company, &trackingNo) {
    company := "", trackingNo := ""
    if RegExMatch(html, "s)list-item--delivered.*?<span[^>]*class=`"text__delivery-cooper`"[^>]*>\s*((?:[^<]|<!--.*?-->)+)\s*</span>", &m) {
        line := m[1]
        ; HTML 주석 제거
        line := RegExReplace(line, "<!--[^>]*-->", " ")
        line := Trim(line)
        if RegExMatch(line, "^\s*(.+)\s+(\d{10,14})\s*$", &parts) {
            company := Trim(parts[1])
            trackingNo := parts[2]
        }
    }
}

; 11번가 배송추적 페이지: HTML에서 택배사·송장번호 추출 (페이지 구조에 맞게 정규식 추가)
; 11번가 배송추적: delivery_info 내 <dt>택배사</dt>/<dt>송장번호</dt> 다음 <dd> 내용 추출 (택배사는 span.num 제외)
ParseCourierFromHtmlElevenst(html, &company, &trackingNo) {
    company := ""
    trackingNo := ""
    if RegExMatch(html, "s)<dt>택배사</dt>\s*<dd>(.*?)</dd>", &m) {
        company := RegExReplace(m[1], "s)<span[^>]*>.*?</span>", "")
        company := Trim(company)
    }
    if RegExMatch(html, "<dt>송장번호</dt>\s*<dd>([^<]+)</dd>", &m)
        trackingNo := Trim(m[1])
}

; 오늘의집: span.css-1ec23nz 내부 </svg> 뒤 텍스트 "택배사명 송장번호" 추출
ParseCourierFromHtmlOhou(html, &company, &trackingNo) {
    company := "", trackingNo := ""
    if RegExMatch(html, "s)css-1ec23nz.*?</svg>([^<]+)</span>", &m) {
        line := Trim(m[1])
        if RegExMatch(line, "^\s*(.+)\s+(\d+)\s*$", &parts) {
            company := Trim(parts[1])
            trackingNo := Trim(parts[2])
        }
    }
}

; 엑셀 같은 행의 AO(택배사), AP(송장번호)에 쓰기
WriteCourierToExcel(excelRow, company, trackingNo) {
    try {
        xl := ComObjActive("Excel.Application")
    } catch {
        return
    }
    wb := xl.ActiveWorkbook
    sh := wb.Worksheets(1)
    sh.Cells(excelRow, AO_COL).Value := company
    sh.Cells(excelRow, AP_COL).Value := trackingNo
}

; 스크립트 시작 시 GUI 표시
CreateGUI()
