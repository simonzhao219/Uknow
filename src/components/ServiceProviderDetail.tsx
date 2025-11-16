import React, { useState, useContext } from "react";
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
} from "lucide-react";
import { mockServiceProviders } from "../data/mockData";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { ReferralCodeCard } from "./referral/ReferralCodeCard";
import { UserContext } from "../App";
import { ReferralGuide } from './referral/ReferralGuide';

export function ServiceProviderDetail() {
  const { user } = useContext(UserContext);
  const { id } = useParams();
  const navigate = useNavigate();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const roommate = mockServiceProviders.find((r) => r.id === id);

  if (!roommate) {
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
              src={roommate.photos[currentImageIndex]}
              alt={`${roommate.name} - 圖片 ${currentImageIndex + 1}`}
              className="w-full h-full object-cover"
            />
          </div>

          {roommate.photos.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {roommate.photos.map((photo, index) => (
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
              <h1 className="text-3xl font-bold">
                {roommate.name}
              </h1>
              <Badge
                variant="default"
                className="text-lg px-3 py-1"
              >
                {roommate.category}
              </Badge>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-5 w-5" />
                <span>
                  {roommate.city} {roommate.district}
                </span>
              </div>

              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-5 w-5" />
                <span>
                  入住時間：
                  {new Date(
                    roommate.createdAt,
                  ).toLocaleDateString("zh-TW")}
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
                {roommate.description}
              </p>
            </CardContent>
          </Card>

          {/* 聯絡方式 */}
          <Card>
            <CardHeader>
              <CardTitle>聯絡方式</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {roommate.contacts.instagram && (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() =>
                    handleContactClick(
                      "instagram",
                      roommate.contacts.instagram,
                    )
                  }
                >
                  <Instagram className="h-5 w-5 mr-3 text-pink-500" />
                  <span className="flex-1 text-left">
                    {roommate.contacts.instagram}
                  </span>
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}

              {roommate.contacts.line && (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() =>
                    handleContactClick(
                      "line",
                      roommate.contacts.line,
                    )
                  }
                >
                  <MessageCircle className="h-5 w-5 mr-3 text-green-500" />
                  <span className="flex-1 text-left">
                    {roommate.contacts.line}
                  </span>
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}

              {roommate.contacts.facebook && (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() =>
                    handleContactClick(
                      "facebook",
                      roommate.contacts.facebook,
                    )
                  }
                >
                  <Facebook className="h-5 w-5 mr-3 text-blue-600" />
                  <span className="flex-1 text-left">
                    {roommate.contacts.facebook}
                  </span>
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}