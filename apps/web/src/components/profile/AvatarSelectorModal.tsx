'use client';

import React, { useState, useRef } from 'react';
import { AvatarCatalogItem } from '@baffa/shared';
import { BAFFA_AVATARS } from '../../constants/avatars';
import { X, Upload, Check, Trash2, Image as ImageIcon, Sparkles, AlertCircle } from 'lucide-react';

interface AvatarSelectorModalProps {
  currentAvatarUrl?: string;
  currentAvatarId?: string | null;
  customAvatarUrl?: string | null;
  token?: string;
  onSelectAvatar: (avatarId: string) => Promise<void>;
  onUploadImage: (base64Data: string, mimeType: string) => Promise<void>;
  onRemoveCustomImage: () => Promise<void>;
  onClose: () => void;
}

export const AvatarSelectorModal: React.FC<AvatarSelectorModalProps> = ({
  currentAvatarUrl,
  currentAvatarId,
  customAvatarUrl,
  token,
  onSelectAvatar,
  onUploadImage,
  onRemoveCustomImage,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'AVATARS' | 'UPLOAD'>('AVATARS');
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>(currentAvatarId || 'avatar-1');
  const [previewImage, setPreviewImage] = useState<string | null>(customAvatarUrl || null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelectAvatar = async (avatar: AvatarCatalogItem) => {
    setSelectedAvatarId(avatar.id);
    setError(null);
    setLoading(true);
    try {
      await onSelectAvatar(avatar.id);
      setSuccess(`تم اختيار أفاتار ${avatar.titleAr} بنجاح!`);
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      setError(err.message || 'فشل تحديث الأفاتار');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (up to 25MB on client before compression)
    if (file.size > 25 * 1024 * 1024) {
      setError('حجم الصورة يجب ألا يتجاوز 25 ميجابايت');
      return;
    }

    // Validate format
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('يرجى اختيار صورة بصيغة JPG أو PNG أو WEBP فقط');
      return;
    }

    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      const rawDataUrl = event.target?.result as string;

      // Automatically optimize and center-crop to 512x512 with Canvas
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const size = 512;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');

          if (ctx) {
            // Calculate center crop
            const minDim = Math.min(img.width, img.height);
            const startX = (img.width - minDim) / 2;
            const startY = (img.height - minDim) / 2;

            ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, size, size);
            const compressed = canvas.toDataURL('image/jpeg', 0.88);
            setPreviewImage(compressed);
          } else {
            setPreviewImage(rawDataUrl);
          }
        } catch {
          setPreviewImage(rawDataUrl);
        }
      };
      img.onerror = () => {
        setPreviewImage(rawDataUrl);
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleUploadSubmit = async () => {
    if (!previewImage || !selectedFile) {
      setError('يرجى اختيار صورة أولاً');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await onUploadImage(previewImage, selectedFile.type);
      setSuccess('تم رفع الصورة وتحديث الملف الشخصي بنجاح! 🎉');
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err: any) {
      setError(err.message || 'فشل رفع الصورة');
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!confirm('هل تريد إزالة الصورة الشخصية والعودة لاستخدام الأفاتار الافتراضي؟')) return;
    setError(null);
    setLoading(true);
    try {
      await onRemoveCustomImage();
      setPreviewImage(null);
      setSelectedFile(null);
      setSuccess('تمت إزالة الصورة بنجاح والعودة للأفاتار');
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      setError(err.message || 'فشل إزالة الصورة');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(8px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        direction: 'rtl',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="baffa-card"
        style={{
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0c1322',
          border: '1px solid var(--baffa-surface-glass-border)',
          borderRadius: 'var(--baffa-radius-xl)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--baffa-surface-glass-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2
              className="arabic-font"
              style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--baffa-gold-hover)', margin: 0 }}
            >
              تغيير الصورة أو الأفاتار
            </h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--baffa-text-muted)' }}>
              اختر شخصيتك المفضلة على الطاولة أو ارفع صورتك الخاصة
            </span>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--baffa-text-muted)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '50%',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--baffa-surface-glass-border)',
            backgroundColor: 'rgba(0, 0, 0, 0.25)',
          }}
        >
          <button
            onClick={() => {
              setActiveTab('AVATARS');
              setError(null);
            }}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: 'none',
              borderBottom: activeTab === 'AVATARS' ? '2px solid var(--baffa-gold-primary)' : '2px solid transparent',
              backgroundColor: activeTab === 'AVATARS' ? 'rgba(245, 158, 11, 0.08)' : 'transparent',
              color: activeTab === 'AVATARS' ? 'var(--baffa-gold-primary)' : 'var(--baffa-text-secondary)',
              fontWeight: 800,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <Sparkles size={16} /> شخصيات بَفّة ({BAFFA_AVATARS.length})
          </button>

          <button
            onClick={() => {
              setActiveTab('UPLOAD');
              setError(null);
            }}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: 'none',
              borderBottom: activeTab === 'UPLOAD' ? '2px solid var(--baffa-gold-primary)' : '2px solid transparent',
              backgroundColor: activeTab === 'UPLOAD' ? 'rgba(245, 158, 11, 0.08)' : 'transparent',
              color: activeTab === 'UPLOAD' ? 'var(--baffa-gold-primary)' : 'var(--baffa-text-secondary)',
              fontWeight: 800,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <ImageIcon size={16} /> رفع صورة شخصية
          </button>
        </div>

        {/* Feedback alerts */}
        {error && (
          <div
            style={{
              margin: '12px 20px 0',
              padding: '10px 14px',
              borderRadius: 'var(--baffa-radius-md)',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {success && (
          <div
            style={{
              margin: '12px 20px 0',
              padding: '10px 14px',
              borderRadius: 'var(--baffa-radius-md)',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#34d399',
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Check size={16} /> {success}
          </div>
        )}

        {/* Content Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {activeTab === 'AVATARS' && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: '12px',
              }}
            >
              {BAFFA_AVATARS.map((avatar) => {
                const isSelected = selectedAvatarId === avatar.id && !customAvatarUrl;
                return (
                  <div
                    key={avatar.id}
                    onClick={() => !loading && handleSelectAvatar(avatar)}
                    style={{
                      padding: '14px 10px',
                      borderRadius: 'var(--baffa-radius-lg)',
                      backgroundColor: isSelected ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                      border: isSelected ? '2px solid var(--baffa-gold-primary)' : '1px solid var(--baffa-surface-glass-border)',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      textAlign: 'center',
                      gap: '8px',
                      transition: 'all 0.2s ease',
                      position: 'relative',
                    }}
                  >
                    {isSelected && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '6px',
                          left: '6px',
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          backgroundColor: 'var(--baffa-gold-primary)',
                          color: '#000',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Check size={12} strokeWidth={3} />
                      </div>
                    )}

                    <div
                      style={{
                        width: '54px',
                        height: '54px',
                        borderRadius: '50%',
                        backgroundColor: `${avatar.color}22`,
                        border: `2px solid ${avatar.color}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.75rem',
                      }}
                    >
                      {avatar.emoji}
                    </div>

                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#fff' }}>
                        {avatar.titleAr}
                      </div>
                      <div
                        style={{
                          fontSize: '0.68rem',
                          color: 'var(--baffa-text-muted)',
                          lineHeight: 1.3,
                          marginTop: '2px',
                        }}
                      >
                        {avatar.descriptionAr}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'UPLOAD' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '10px 0' }}>
              {/* Preview Circle */}
              <div
                style={{
                  width: '120px',
                  height: '120px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  border: '3px solid var(--baffa-gold-primary)',
                  boxShadow: 'var(--baffa-shadow-glow-gold)',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                }}
              >
                {previewImage ? (
                  <img
                    src={previewImage}
                    alt="Preview"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--baffa-text-muted)' }}>
                    <ImageIcon size={36} />
                    <div style={{ fontSize: '0.72rem', marginTop: '4px' }}>لا توجد صورة</div>
                  </div>
                )}
              </div>

              {/* Upload Drop/Select Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: '100%',
                  padding: '24px',
                  borderRadius: 'var(--baffa-radius-lg)',
                  border: '2px dashed var(--baffa-surface-glass-border)',
                  backgroundColor: 'rgba(0, 0, 0, 0.2)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png, image/jpeg, image/webp"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
                <Upload size={28} color="var(--baffa-gold-primary)" />
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff' }}>
                  {selectedFile ? selectedFile.name : 'اضغط لاختيار صورة من جهازك'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--baffa-text-muted)' }}>
                  الصيغ المدعومة: JPG, PNG, WEBP (الحد الأقصى: 25 ميجابايت)
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px', width: '100%', marginTop: '8px' }}>
                <button
                  onClick={handleUploadSubmit}
                  disabled={!selectedFile || loading}
                  className="baffa-btn-primary"
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    opacity: !selectedFile || loading ? 0.6 : 1,
                    cursor: !selectedFile || loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Upload size={16} /> {loading ? 'جاري الرفع...' : 'حفظ الصورة كصورة شخصية'}
                </button>

                {(customAvatarUrl || previewImage) && (
                  <button
                    onClick={handleRemovePhoto}
                    disabled={loading}
                    className="baffa-btn-danger"
                    style={{
                      padding: '10px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                    title="حذف الصورة والعودة للأفاتار"
                  >
                    <Trash2 size={16} /> إزالة
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
