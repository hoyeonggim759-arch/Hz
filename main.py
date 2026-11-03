from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.responses import FileResponse
from sqlalchemy import create_engine, Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from pydantic import BaseModel
from jose import JWTError, jwt
from datetime import datetime, timedelta
import time
import hashlib
import secrets

SECRET_KEY = "Dove_Super_Secret_Key_2026_Do_Not_Share"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/login")

SQLALCHEMY_DATABASE_URL = "sqlite:///./dove.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    expire_time = Column(Float)

class Record(Base):
    __tablename__ = "records"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    phone = Column(String)
    tag = Column(String)
    status = Column(String)
    time = Column(String)

Base.metadata.create_all(bind=engine)

class UserCreate(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    expire_time: float

class RecordCreate(BaseModel):
    phone: str
    tag: str
    isScheduled: bool

class RenewReq(BaseModel):
    cardKey: str

app = FastAPI(title="Dove 安全后端")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# 替代 passlib 的稳定加密方案
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
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="유효하지 않은 인증 정보입니다. (인증 실패)",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None: raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = db.query(User).filter(User.username == username).first()
    if user is None: raise credentials_exception
    if user.expire_time <= time.time():
        raise HTTPException(status_code=403, detail="계정 기간이 만료되었습니다. (账号已过期)")
    return user

@app.post("/api/register", response_model=Token)
def register(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if db_user: raise HTTPException(status_code=400, detail="이미 존재하는 아이디입니다. (用户名已存在)")
    hashed_pwd = get_password_hash(user.password)
    new_expire = time.time() + 7 * 24 * 60 * 60 
    new_user = User(username=user.username, hashed_password=hashed_pwd, expire_time=new_expire)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    access_token = create_access_token(data={"sub": new_user.username})
    return {"access_token": access_token, "token_type": "bearer", "expire_time": new_user.expire_time}

@app.post("/api/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 잘못되었습니다. (账号或密码错误)")
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer", "expire_time": user.expire_time}

@app.get("/api/userinfo")
def get_userinfo(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    records = db.query(Record).filter(Record.user_id == current_user.id).order_by(Record.id.desc()).all()
    return {"username": current_user.username, "expireTime": current_user.expire_time, "records": records}

@app.post("/api/submit")
def submit_phone(record: RecordCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if len(record.phone) != 11:
        raise HTTPException(status_code=400, detail="올바른 11자리 번호를 입력하세요. (手机号格式错误)")
    new_record = Record(
        user_id=current_user.id, phone=record.phone, tag=record.tag,
        status="예약 중" if record.isScheduled else "완료됨",
        time=datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    )
    db.add(new_record)
    db.commit()
    records = db.query(Record).filter(Record.user_id == current_user.id).order_by(Record.id.desc()).all()
    return {"message": "제출 성공 (提交成功)", "records": records}

@app.post("/api/renew")
def renew(renew_req: RenewReq, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if renew_req.cardKey != "TEST-30-DAYS":
        raise HTTPException(status_code=400, detail="유효하지 않은 카드 키입니다. (无效的卡密)")
    current_user.expire_time += 30 * 24 * 60 * 60
    db.commit()
    return {"message": "30일이 추가되었습니다. (增加30天)", "expireTime": current_user.expire_time}

@app.delete("/api/records/{record_id}")
def delete_record(record_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    record = db.query(Record).filter(Record.id == record_id, Record.user_id == current_user.id).first()
    if not record: raise HTTPException(status_code=404, detail="기록을 찾을 수 없습니다. (记录不存在)")
    db.delete(record)
    db.commit()
    records = db.query(Record).filter(Record.user_id == current_user.id).order_by(Record.id.desc()).all()
    return {"message": "삭제되었습니다. (删除成功)", "records": records}

@app.post("/api/force-expire")
def force_expire(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    current_user.expire_time = time.time() - 1000
    db.commit()
    return {"message": "계정이 만료되었습니다."}

@app.get("/")
def read_index():
    return FileResponse("index.html")