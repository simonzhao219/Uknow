import React, { useState, useContext, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Badge } from "./ui/badge";
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Instagram,
  MessageCircle,
  Facebook,
  ExternalLink,
  Copy,
} from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { ReferralCodeCard } from "./referral/ReferralCodeCard";
import { UserContext } from "../App";
import { ReferralGuide } from './referral/ReferralGuide';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { useNotification } from './notifications/NotificationContext';

export function ServiceProviderDetail() {
  const { user } = useContext(UserContext);
  const { showToast } = useNotification();
  const { id } = useParams();
  const navigate = useNavigate();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  
  // ✅ 添加状态管理
  const [serviceProvider, setServiceProvider] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // ✅ 从后端 API 获取数据
  useEffect(() => {
    if (!id) return;
    
    const fetchListing = async () => {
      setLoading(true);
      setError(false);
      try {
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-5c6718b9/listings/${id}`,
          {
            headers: {
              'Authorization': `Bearer ${publicAnonKey}`
            }
          }
        );

        if (!response.ok) {
          throw new Error('獲取刊登詳情失敗');
        }

        const data = await response.json();
        console.log('詳情頁 - 獲取到的刊登:', data);
        setServiceProvider(data.listing);
      } catch (error) {
        console.error('❌ 獲取刊登詳情失敗:', error);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchListing();
  }, [id]);

  // ✅ 添加 loading 状态
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto text-center py-12">
        <p className="text-muted-foreground">載入中...</p>
      </div>
    );
  }

  // ✅ 修改错误状态
  if (error || !serviceProvider) {
    return (
      <div className="max-w-4xl mx-auto text-center py-12">
        <h2 className="text-2xl font-bold mb-4">
          找不到此服務者
        </h2>
        <Button onClick={() => navigate("/")}>返回首頁</Button>
      </div>
    );
  }

  const handleContactClick = (
    platform: string,
    value: string,
  ) => {
    let url = "";
    switch (platform) {
      case "instagram":
        url = `https://instagram.com/${value.replace("@", "")}`;
        break;
      case "line":
        url = `https://line.me/R/ti/p/${value}`;
        break;
      case "facebook":
        url = `https://facebook.com/${value}`;
        break;
    }
    if (url) {
      window.open(url, "_blank");
    }
  };

  const copyLineId = (lineId: string) => {
    const textArea = document.createElement('textarea');
    textArea.value = lineId;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showToast('LINE ID 已複製！', 'success');
    } catch (err) {
      console.error('複製失敗:', err);
      showToast('複製失敗，請重試', 'error');
    }
    document.body.removeChild(textArea);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 返回按鈕 */}
      <Button
        variant="ghost"
        onClick={() => navigate(-1)}
        className="flex items-center gap-2"
      >
        <ArrowLeft className="h-4 w-4" />
        返回
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 圖片區域 */}
        <div className="space-y-4">
          <div className="aspect-video rounded-lg overflow-hidden">
            <ImageWithFallback
              src={serviceProvider.photos[currentImageIndex]}
              alt={`${serviceProvider.name} - 圖片 ${currentImageIndex + 1}`}
              className="w-full h-full object-cover"
            />
          </div>

          {serviceProvider.photos.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {serviceProvider.photos.map((photo, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentImageIndex(index)}
                  className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-colors ${
                    currentImageIndex === index
                      ? "border-primary"
                      : "border-transparent"
                  }`}
                >
                  <ImageWithFallback
                    src={photo}
                    alt={`縮圖 ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 詳細資訊區域 */}
        <div className="space-y-6">
          <div>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold">
                  {serviceProvider.name}
                </h1>
                {/* 🆕 性别 Badge */}
                {serviceProvider.gender && (
                  <Badge 
                    variant="outline" 
                    className={`text-base ${serviceProvider.gender === '男' ? 'border-blue-500 text-blue-600' : 'border-pink-500 text-pink-600'}`}
                  >
                    {serviceProvider.gender === '男' ? '♂ 男' : '♀ 女'}
                  </Badge>
                )}
              </div>
              <Badge
                variant="default"
                className="text-lg px-3 py-1"
              >
                {serviceProvider.category}
              </Badge>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-5 w-5" />
                <span>
                  {serviceProvider.city} {Array.isArray(serviceProvider.districts) 
                    ? (serviceProvider.districts.includes('全區') 
                        ? '全區' 
                        : serviceProvider.districts.join(', '))
                    : serviceProvider.district || ''}
                </span>
              </div>
            </div>
          </div>

          {/* 服務介紹 */}
          <Card>
            <CardHeader>
              <CardTitle>服務介紹</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">
                {serviceProvider.description}
              </p>
            </CardContent>
          </Card>

          {/* 聯絡方式 */}
          <Card>
            <CardHeader>
              <CardTitle>聯絡方式</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {serviceProvider.contacts.facebook && (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() =>
                    handleContactClick(
                      "facebook",
                      serviceProvider.contacts.facebook,
                    )
                  }
                >
                  <Facebook className="h-5 w-5 mr-3 text-blue-600" />
                  <span className="flex-1 text-left">
                    {serviceProvider.contacts.facebook}
                  </span>
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
              
              {serviceProvider.contacts.instagram && (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() =>
                    handleContactClick(
                      "instagram",
                      serviceProvider.contacts.instagram,
                    )
                  }
                >
                  <Instagram className="h-5 w-5 mr-3 text-pink-500" />
                  <span className="flex-1 text-left">
                    {serviceProvider.contacts.instagram}
                  </span>
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}

              {serviceProvider.contacts.line && (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() =>
                    copyLineId(
                      serviceProvider.contacts.line,
                    )
                  }
                >
                  <MessageCircle className="h-5 w-5 mr-3 text-green-500" />
                  <span className="flex-1 text-left">
                    {serviceProvider.contacts.line}
                  </span>
                  <Copy className="h-4 w-4" />
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}