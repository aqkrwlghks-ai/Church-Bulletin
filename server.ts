import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(import.meta.dirname, 'data_store.json');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets from root and assets directories
app.use('/assets', express.static(path.join(import.meta.dirname, 'assets')));
app.use(express.static(import.meta.dirname));

// Seed database with default values from images if it doesn't exist
const DEFAULT_CHURCHES = [
  { id: "소망", leader: "김광선", attendance: "", baseCumulative: 14142, thisWeek: 460, cumulative: 14602 },
  { id: "벧엘", leader: "김길남", attendance: "", baseCumulative: 5182, thisWeek: 104, cumulative: 5286 },
  { id: "부흥", leader: "김동주", attendance: "직", baseCumulative: 530, thisWeek: 0, cumulative: 530 },
  { id: "샬롬", leader: "김애신", attendance: "", baseCumulative: 3488, thisWeek: 200, cumulative: 3688 },
  { id: "믿음", leader: "조영숙", attendance: "", baseCumulative: 4059, thisWeek: 125, cumulative: 4184 },
  { id: "로뎀", leader: "윤명순", attendance: "원", baseCumulative: 3213, thisWeek: 160, cumulative: 3373 },
  { id: "사랑", leader: "이숙용", attendance: "", baseCumulative: 6237, thisWeek: 150, cumulative: 6387 },
  { id: "동행", leader: "임상섭", attendance: "", baseCumulative: 11819, thisWeek: 460, cumulative: 12279 },
  { id: "마하나임", leader: "임춘옥", attendance: "회", baseCumulative: 4459, thisWeek: 159, cumulative: 4618 },
  { id: "임마누엘", leader: "정현숙", attendance: "", baseCumulative: 7561, thisWeek: 300, cumulative: 7861 },
  { id: "한나", leader: "김명선", attendance: "", baseCumulative: 3493, thisWeek: 138, cumulative: 3631 },
  { id: "새가족", leader: "새가족", attendance: "", baseCumulative: 0, thisWeek: 0, cumulative: 0 }
];

function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    const initialData = {
      bulletinData: {},
      familyChurches: DEFAULT_CHURCHES,
      editableElements: {}
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
    return initialData;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error("DB File read error, recovering with empty state:", e);
    return { bulletinData: {}, familyChurches: DEFAULT_CHURCHES, editableElements: {} };
  }
}

function writeDB(data: any) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// Route to serve leader input form
app.get('/leader', (req, res) => {
  res.sendFile(path.join(import.meta.dirname, 'leader.html'));
});

// API endpoint to retrieve full bulletin dataset
app.get('/api/data', (req, res) => {
  const db = readDB();
  res.json(db);
});

// API endpoint for admin save
app.post('/api/save', (req, res) => {
  const { bulletinData, familyChurches, editableElements } = req.body;
  const db = readDB();
  if (bulletinData) db.bulletinData = bulletinData;
  if (familyChurches) db.familyChurches = familyChurches;
  if (editableElements) db.editableElements = editableElements;
  writeDB(db);
  res.json({ success: true, message: "Saved successfully" });
});

// API endpoint for leader submission
app.post('/api/leader-input', (req, res) => {
  const { churchId, attendance, thisWeek } = req.body;
  
  if (!churchId) {
    return res.status(400).json({ success: false, message: "가정교회를 선택해주세요." });
  }

  const db = readDB();
  const churchIndex = db.familyChurches.findIndex((c: any) => c.id === churchId);

  if (churchIndex === -1) {
    return res.status(404).json({ success: false, message: "존재하지 않는 가정교회입니다." });
  }

  const church = db.familyChurches[churchIndex];
  
  // Update attendance and weekly reading pages
  if (attendance !== undefined) {
    church.attendance = attendance.trim();
  }
  
  const parsedThisWeek = parseInt(thisWeek);
  if (!isNaN(parsedThisWeek)) {
    church.thisWeek = parsedThisWeek;
    // Recalculate cumulative based on base cumulative + this week's pages
    church.cumulative = church.baseCumulative + parsedThisWeek;
  }

  db.familyChurches[churchIndex] = church;
  writeDB(db);

  res.json({ 
    success: true, 
    message: `${churchId} 가정교회의 데이터가 성공적으로 반영되었습니다.`,
    data: church
  });
});

// API endpoint to transition to a new week (accumulate statistics)
app.post('/api/new-week', (req, res) => {
  const db = readDB();
  
  // 1. Roll weekly numbers into cumulative base
  db.familyChurches = db.familyChurches.map((church: any) => {
    const finalBase = church.baseCumulative + church.thisWeek;
    return {
      ...church,
      baseCumulative: finalBase,
      thisWeek: 0,
      attendance: "",
      cumulative: finalBase
    };
  });

  // 2. Increment Sunday date by 7 days if date format is parsed correctly
  let currentDateStr = db.bulletinData['input-date'] || "2026년 6월 21일";
  const dateRegex = /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/;
  const match = currentDateStr.match(dateRegex);
  
  if (match) {
    const year = parseInt(match[1]);
    const month = parseInt(match[2]) - 1; // 0-indexed
    const day = parseInt(match[3]);
    const dateObj = new Date(year, month, day);
    dateObj.setDate(dateObj.getDate() + 7);
    
    db.bulletinData['input-date'] = `${dateObj.getFullYear()}년 ${dateObj.getMonth() + 1}월 ${dateObj.getDate()}일`;
  }

  // 3. Increment week number (e.g. "29주차" -> "30주차", "통권 22" -> "통권 23")
  let currentWeekStr = db.bulletinData['input-week'] || "29주차 / 통권 22";
  const weekRegex = /(\d+)\s*주차\s*\/\s*통권\s*(\d+)/;
  const weekMatch = currentWeekStr.match(weekRegex);
  
  if (weekMatch) {
    const nextWeek = parseInt(weekMatch[1]) + 1;
    const nextIssue = parseInt(weekMatch[2]) + 1;
    db.bulletinData['input-week'] = `${nextWeek}주차 / 통권 ${nextIssue}`;
  }

  writeDB(db);
  res.json({ success: true, message: "새 주차 통계 누적이 완료되었습니다.", data: db });
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
