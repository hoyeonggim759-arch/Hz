from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.responses import FileResponse
from sqlalchemy import create_engine, Column, Integer, String, Float, ForeignKey, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from pydantic import BaseModel
from jose import JWTError, jwt
from datetime import datetime, timedelta
import time
import hashlib
import secrets
import random
import string

SECRET_KEY = "Dove_Super_Secret_Key_2026_Do_Not_Share"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/login")

SQLALCHEMY_DATABASE_URL = "sqlite:///./dove.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- 数据库模型 ---
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String, nullable=True) # 卡密注册用户可能没有密码
    expire_time = Column(Float)
    is_admin = Column(Boolean, default=False)

class Record(Base):
    __tablename__ = "records"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    phone = Column(String)
    tag = Column(String)
    status = Column(String)
    time = Column(String)

class Card(Base):
    __tablename__ = "cards"
    id = Column(Integer, primary_key=True, index=True)
    card_key = Column(String, unique=True, index=True)
    days = Column(Integer)
    is_used = Column(Boolean, default=False)
    used_by = Column(String, nullable=True)
    created_at = Column(String)

class VisitLog(Base):
    __tablename__ = "visit_logs"
    id = Column(Integer, primary_key=True, index=True)
    ip = Column(String)
    username = Column(String, nullable=True)
    path = Column(String)
    time = Column(String)

Base.metadata.create_all(bind=engine)

# --- Pydantic 模型 ---
class UserCreate(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    expire_time: float
    is_admin: bool
    username: str

class RecordCreate(BaseModel):
    phone: str
    tag: str
    isScheduled: bool

class RedeemReq(BaseModel):
    cardKey: str

class GenerateCardReq(BaseModel):
    days: int
    count: int = 1

app = FastAPI(title="Dove 安全后端")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 🌟 自动记录访问 IP 的中间件
@app.middleware("http")
async def log_requests(request: Request, call_next):
    # 过滤掉静态文件和API请求，只记录页面访问
    if request.url.path == "/" or request.url.path.endswith(".html"):
        db = SessionLocal()
        ip = request.client.host
        log = VisitLog(ip=ip, path=request.url.path, time=datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        db.add(log)
        db.commit()
        db.close()
    response = await call_next(request)
    return response

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_password_hash(password: str) -> str:
    salt = secrets.token_hex(16)
    pwd_hash = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000).hex()
    return f"{salt}${pwd_hash}"

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        salt, pwd_hash = hashed_password.split('$')
        new_hash = hashlib.pbkdf2_hmac('sha256', plain_password.encode('utf-8'), salt.encode('utf-8'), 100000).hex()
        return new_hash == pwd_hash
    except:
        return False

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(status_code=401, detail="유효하지 않은 인증 정보입니다.")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None: raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = db.query(User).filter(User.username == username).first()
    if user is None: raise credentials_exception
    if user.expire_time <= time.time() and not user.is_admin:
        raise HTTPException(status_code=403, detail="계정 기간이 만료되었습니다.")
    return user

def get_admin_user(current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="관리자 권한이 없습니다.")
    return current_user

# ================= 接口路由 =================

@app.post("/api/register", response_model=Token)
def register(user: UserCreate, db: Session = Depends(get_db)):
    # 🌟 强制拦截：禁止注册 admin 账号
    if user.username.lower() == 'admin':
        raise HTTPException(status_code=400, detail="이 아이디는 사용할 수 없습니다.")
        
    db_user = db.query(User).filter(User.username == user.username).first()
    if db_user: raise HTTPException(status_code=400, detail="이미 존재하는 아이디입니다.")
    
    hashed_pwd = get_password_hash(user.password)
    new_expire = time.time() + 7 * 24 * 60 * 60 
    new_user = User(username=user.username, hashed_password=hashed_pwd, expire_time=new_expire)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    access_token = create_access_token(data={"sub": new_user.username})
    return {"access_token": access_token, "token_type": "bearer", "expire_time": new_user.expire_time, "is_admin": new_user.is_admin, "username": new_user.username}

@app.post("/api/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # 🌟 硬编码管理员账号
    if form_data.username == 'admin' and form_data.password == '123456':
        access_token = create_access_token(data={"sub": "admin"})
        return {"access_token": access_token, "token_type": "bearer", "expire_time": 9999999999, "is_admin": True, "username": "admin"}

    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 잘못되었습니다.")
    
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer", "expire_time": user.expire_time, "is_admin": False, "username": user.username}

@app.post("/api/login_by_card", response_model=Token)
def login_by_card(req: RedeemReq, db: Session = Depends(get_db)):
    """使用卡密直接登录/注册（如果用户不存在则自动创建随机用户名）"""
    card = db.query(Card).filter(Card.card_key == req.cardKey, Card.is_used == False).first()
    if not card:
        raise HTTPException(status_code=400, detail="유효하지 않거나 이미 사용된 카드 키입니다.")
    
    # 生成随机用户名
    random_name = "user_" + ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    new_expire = time.time() + card.days * 24 * 60 * 60
    
    new_user = User(username=random_name, hashed_password=None, expire_time=new_expire)
    db.add(new_user)
    
    card.is_used = True
    card.used_by = random_name
    db.commit()
    db.refresh(new_user)
    
    access_token = create_access_token(data={"sub": new_user.username})
    return {"access_token": access_token, "token_type": "bearer", "expire_time": new_user.expire_time, "is_admin": False, "username": new_user.username}

@app.get("/api/userinfo")
def get_userinfo(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    records = db.query(Record).filter(Record.user_id == current_user.id).order_by(Record.id.desc()).all()
    return {"username": current_user.username, "expireTime": current_user.expire_time, "records": records, "is_admin": current_user.is_admin}

@app.post("/api/submit")
def submit_phone(record: RecordCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if len(record.phone) != 11:
        raise HTTPException(status_code=400, detail="올바른 11자리 번호를 입력하세요.")
    new_record = Record(
        user_id=current_user.id, phone=record.phone, tag=record.tag,
        status="예약 중" if record.isScheduled else "완료됨",
        time=datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    )
    db.add(new_record)
    db.commit()
    records = db.query(Record).filter(Record.user_id == current_user.id).order_by(Record.id.desc()).all()
    return {"message": "제출 성공", "records": records}

@app.post("/api/renew")
def renew(renew_req: RedeemReq, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    card = db.query(Card).filter(Card.card_key == renew_req.cardKey, Card.is_used == False).first()
    if not card:
        raise HTTPException(status_code=400, detail="유효하지 않거나 이미 사용된 카드 키입니다.")
    
    current_user.expire_time += card.days * 24 * 60 * 60
    card.is_used = True
    card.used_by = current_user.username
    db.commit()
    return {"message": f"{card.days}일이 추가되었습니다.", "expireTime": current_user.expire_time}

@app.delete("/api/records/{record_id}")
def delete_record(record_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    record = db.query(Record).filter(Record.id == record_id, Record.user_id == current_user.id).first()
    if not record: raise HTTPException(status_code=404, detail="기록을 찾을 수 없습니다.")
    db.delete(record)
    db.commit()
    records = db.query(Record).filter(Record.user_id == current_user.id).order_by(Record.id.desc()).all()
    return {"message": "삭제되었습니다.", "records": records}

# ================= 管理员专属接口 =================

@app.post("/api/admin/generate_card")
def generate_card(req: GenerateCardReq, admin: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    keys = []
    for _ in range(req.count):
        key = ''.join(random.choices(string.ascii_uppercase + string.digits, k=12))
        new_card = Card(card_key=key, days=req.days, created_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        db.add(new_card)
        keys.append(key)
    db.commit()
    return {"message": f"{req.count}개의 카드가 생성되었습니다.", "keys": keys}

@app.get("/api/admin/cards")
def get_cards(admin: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    cards = db.query(Card).order_by(Card.id.desc()).limit(100).all()
    return cards

@app.get("/api/admin/visits")
def get_visits(admin: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    visits = db.query(VisitLog).order_by(VisitLog.id.desc()).limit(100).all()
    return visits

@app.get("/")
def read_index():
    return FileResponse("index.html")
